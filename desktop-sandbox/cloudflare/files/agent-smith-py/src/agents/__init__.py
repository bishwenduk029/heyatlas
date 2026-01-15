"""Agent factories for the multi-agent workforce."""

from src.agents.browser import create_browser_agent
from src.agents.terminal import create_terminal_agent
from src.agents.docx import create_docx_agent
from src.agents.xlsx import create_xlsx_agent
from src.agents.pptx import create_pptx_agent
from src.agents.planning import create_planning_agent

__all__ = [
    "create_browser_agent",
    "create_terminal_agent",
    "create_docx_agent",
    "create_xlsx_agent",
    "create_pptx_agent",
    "create_planning_agent",
]
