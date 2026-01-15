"""
Browser Agent - Web automation and research specialist.

Uses CAMEL's BrowserToolkit for:
- Web navigation and interaction
- Form filling and data extraction
- Screenshot capture
- Content scraping
"""

from camel.agents import ChatAgent
from camel.toolkits import BrowserToolkit

from src.config import create_agent_model
from src.prompts import BROWSER_PROMPT


def create_browser_agent() -> ChatAgent:
    """
    Creates the Browser Agent for web automation.
    
    Note: Requires playwright to be installed (playwright install).
    """
    model = create_agent_model()
    
    toolkit = BrowserToolkit(headless=True)
    tools = toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=BROWSER_PROMPT,
        model=model,
        tools=tools,
    )
    
    return agent
