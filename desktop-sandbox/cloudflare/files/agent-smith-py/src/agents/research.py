"""
Research Agent - Academic and web research specialist.

Uses CAMEL toolkits for comprehensive research:
- ArxivToolkit: Academic paper search
- SearchToolkit: Web search (DuckDuckGo, Google, etc.)
"""

from camel.agents import ChatAgent
from camel.toolkits import ArxivToolkit, SearchToolkit

from src.config import create_agent_model
from src.prompts import RESEARCH_PROMPT


def create_research_agent() -> ChatAgent:
    """
    Creates the Research Agent for academic and web research.
    
    Tools:
    - ArXiv search for academic papers
    - Web search for general information
    """
    model = create_agent_model()
    
    # Combine research tools
    arxiv_toolkit = ArxivToolkit()
    search_toolkit = SearchToolkit()
    
    tools = arxiv_toolkit.get_tools() + search_toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=RESEARCH_PROMPT,
        model=model,
        tools=tools,
    )
    
    return agent
