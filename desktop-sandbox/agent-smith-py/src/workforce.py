"""
Multi-Agent Workforce - CAMEL-AI based workforce orchestration.

Creates a workforce with specialized agents for different tasks:
- Browser automation (web research, scraping)
- Terminal operations (shell commands, file management)
- Document processing (Excel, PowerPoint, Word)
- Search and research (ArXiv, web search)
"""

from camel.societies.workforce import Workforce
from camel.agents import ChatAgent

from typing import Optional
from camel.societies.workforce.workforce_callback import WorkforceCallback

from src.config import create_agent_model
from src.prompts import COORDINATOR_PROMPT
from src.callbacks import StreamingCallback

# Agent factories
from src.agents.planning import create_planning_agent
from src.agents.browser import create_browser_agent
from src.agents.terminal import create_terminal_agent
from src.agents.docx import create_docx_agent
from src.agents.xlsx import create_xlsx_agent
from src.agents.pptx import create_pptx_agent
from src.agents.research import create_research_agent


async def create_workforce_with_callback(
    callback: Optional[WorkforceCallback] = None,
) -> Workforce:
    """
    Creates the multi-agent workforce with specialized workers and custom callback.

    Args:
        callback: Optional callback for streaming events. If None, uses default.

    Workers:
    - Browser: Web automation, research, data extraction
    - Terminal: Shell commands, file operations
    - Research: ArXiv papers, web search, semantic scholar
    - Excel: Spreadsheet processing and analysis
    - PowerPoint: Presentation creation
    - Document: Word document creation/editing
    """
    model = create_agent_model()

    # Coordinator agent orchestrates task assignment
    coordinator = ChatAgent(
        system_message=COORDINATOR_PROMPT,
        model=model,
    )

    # Planning agent for task decomposition
    planner = create_planning_agent()

    # Use provided callback or create default
    callbacks = [callback] if callback else [StreamingCallback("default")]

    # Initialize workforce with callback for event streaming
    workforce = Workforce(
        description="Multi-agent workforce for document processing, web automation, research, and system tasks.",
        coordinator_agent=coordinator,
        task_agent=planner,
        new_worker_agent=model,
        callbacks=callbacks,
        graceful_shutdown_timeout=30.0,
    )

    # Add specialized workers

    workforce.add_single_agent_worker(
        description="Browser automation specialist for web research, navigation, form filling, and data extraction from websites.",
        worker=await create_browser_agent(),
    )

    workforce.add_single_agent_worker(
        description="Terminal and shell specialist for executing commands, file operations, and system administration tasks.",
        worker=create_terminal_agent(),
    )

    workforce.add_single_agent_worker(
        description="Research specialist for searching academic papers, web content, and aggregating information from multiple sources.",
        worker=create_research_agent(),
    )

    workforce.add_single_agent_worker(
        description="Excel specialist for creating, reading, and analyzing spreadsheets with formulas and data processing.",
        worker=create_xlsx_agent(),
    )

    workforce.add_single_agent_worker(
        description="PowerPoint specialist for creating presentations with slides, text, images, and layouts.",
        worker=create_pptx_agent(),
    )

    workforce.add_single_agent_worker(
        description="Document specialist for creating and editing Word documents, reports, and text files.",
        worker=create_docx_agent(),
    )

    return workforce


async def create_workforce() -> Workforce:
    """Creates workforce with default callback (for CLI mode)."""
    return await create_workforce_with_callback(None)
