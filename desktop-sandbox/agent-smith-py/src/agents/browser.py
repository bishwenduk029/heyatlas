"""
Browser Agent - Web automation and research specialist.

Uses MCP toolkit for browser automation via:
- Web navigation and interaction
- Form filling and data extraction
- Screenshot capture
- Content scraping
"""

import asyncio
from camel.toolkits.mcp_toolkit import MCPToolkit
from camel.agents import ChatAgent

from src.config import create_agent_model
from src.prompts import BROWSER_PROMPT


async def create_browser_agent() -> ChatAgent:
    """
    Creates the Browser Agent for web automation.

    Uses MCP toolkit connected to browser_use server.
    """
    model = create_agent_model()

    async with MCPToolkit(config_path="src/agents/mcp/browser.json") as toolkit:
        agent = ChatAgent(
            system_message=BROWSER_PROMPT,
            model=model,
            tools=toolkit.get_tools(),
        )

        return agent


async def main():
    agent = await create_browser_agent()
    response = await agent.astep("Navigate to youtube.com and take a screenshot.")
    print(response.msgs[0].content)


if __name__ == "__main__":
    asyncio.run(main())
