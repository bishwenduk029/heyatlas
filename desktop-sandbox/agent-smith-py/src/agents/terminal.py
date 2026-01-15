"""
Terminal Agent - Shell and file operations specialist.

Uses CAMEL's TerminalToolkit for:
- Executing shell commands
- File search by name/content
- Process management
- File system operations
"""

from camel.agents import ChatAgent
from camel.toolkits import TerminalToolkit, FileWriteToolkit

from src.config import create_agent_model
from src.prompts import TERMINAL_PROMPT


def create_terminal_agent() -> ChatAgent:
    """
    Creates the Terminal Agent for shell operations.
    
    Configured with safe_mode=True for security.
    """
    model = create_agent_model()
    
    terminal_toolkit = TerminalToolkit()
    file_toolkit = FileWriteToolkit()
    
    tools = terminal_toolkit.get_tools() + file_toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=TERMINAL_PROMPT,
        model=model,
        tools=tools,
    )
    
    return agent
