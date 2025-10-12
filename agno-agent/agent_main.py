import json
import logging
import os
from typing import Awaitable, Callable, Optional, Union

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.openai import OpenAILike
from agno.tools.calculator import CalculatorTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.mcp import MCPTools
from agno.tools.shell import ShellTools
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class ComputerAgent:
    """Agno-based computer agent with MCP tools."""

    def __init__(self, user_id: str = "anonymous"):
        self.user_id = user_id
        self.agent: Optional[Agent] = None
        self.db = SqliteDb(db_file="agents.db")
        self.mcp_tools: list[MCPTools] = []
        self.message_sender: Optional[Callable[[dict], Awaitable[None]]] = None

    async def initialize(self) -> None:
        """Initialize the agent with MCP tools."""
        try:
            self.mcp_tools = []
            self.tools = []

            software_engineer_tool = MCPTools(
                command="uvx --from cased-kit kit-dev-mcp"
            )
            await software_engineer_tool.connect()
            self.mcp_tools.append(software_engineer_tool)

            web_tool = MCPTools(command="npx -y @playwright/mcp@latest")
            await web_tool.connect()
            self.mcp_tools.append(web_tool)

            self.tools = self.mcp_tools + [
                ShellTools(),
                CalculatorTools(),
                DuckDuckGoTools(),
                self.send_message_to_voice_agent,
            ]

            # api_key will be injected by the provider (E2B) via env var HEYCOMPUTER_AI_API_KEY
            # which actually holds the user-specific Bifrost Virtual Key.
            api_key = os.getenv("HEYCOMPUTER_AI_API_KEY")

            self.agent = Agent(
                model=OpenAILike(
                    base_url=os.getenv("BIFROST_URL", "http://localhost:8080/v1"),
                    id="openrouter/z-ai/glm-4.6",
                    api_key=api_key,
                ),
                description=self._get_description(),
                instructions=self._get_instructions(),
                tools=self.tools,
                db=self.db,
                add_history_to_context=True,
                num_history_runs=5,
                read_chat_history=True,
                enable_session_summaries=False,
                add_memories_to_context=True,
                user_id=self.user_id,
                telemetry=False,
                debug_mode=True,
            )

            logger.info("Agno agent initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize agent: {e}", exc_info=True)
            raise

    def set_message_sender(self, sender: Callable[[dict], Awaitable[None]]) -> None:
        """Register the callback used to send messages back to the voice agent."""
        self.message_sender = sender

    def _get_description(self) -> str:
        """Get agent description for system message building."""
        return "You are computer assistant, a backend automation agent supporting the voice agent in executing tasks for users. You must always communicate task progress back to the voice agent."

    def _get_instructions(self) -> list:
        """Get instructions list for system message building."""
        return [
            "Report progress to voice agent via send_message_to_voice_agent tool with status (running/completed/needs_input/error), progress percentage, and current activity description",
            "Break complex tasks into simpler digital steps and report after each major step",
            "If user input is needed, communicate clearly to voice agent what you need",
            "All agent responses must be plain textual content and must be sent using the following response message format and ENSURE TO INCLUDE THE sessionId:",
            'response_msg = {"type": "response", "content": content, "session_id": session_id}',
        ]

    async def send_message_to_voice_agent(self, message: Union[str, dict]) -> None:
        """Send a structured message to the voice agent via the registered sender."""
        if not self.message_sender:
            logger.error(
                "Message sender not configured; cannot send update to voice agent"
            )
            return

        try:
            payload = json.loads(message) if isinstance(message, str) else message
        except json.JSONDecodeError:
            logger.error("send_message_to_voice_agent expects JSON-serializable input")
            return

        if not isinstance(payload, dict):
            logger.error("send_message_to_voice_agent payload must be a JSON object")
            return

        try:
            await self.message_sender(payload)
        except Exception as e:
            logger.error(f"Failed to send message to voice agent: {e}", exc_info=True)

    async def run_task(self, task: str, session_id: str) -> str:
        """Run a task with the agent."""
        if not self.agent:
            msg = "Agent not initialized. Call initialize() first."
            raise RuntimeError(msg)

        try:
            response = await self.agent.arun(
                input=task, user_id=self.user_id, session_id=session_id, stream=False
            )
            return response.content
        except Exception as e:
            logger.error(f"Task execution failed: {e}", exc_info=True)
            raise

    async def run_task_stream(self, task: str, session_id: str):
        """Run a task with responses."""
        if not self.agent:
            msg = "Agent not initialized. Call initialize() first."
            raise RuntimeError(msg)

        await self.agent.arun(
            input=task, user_id=self.user_id, session_id=session_id, stream=False
        )

    async def cleanup(self):
        """Clean up resources."""
        if not self.mcp_tools:
            return

        for tool in self.mcp_tools:
            try:
                await tool.close()
            except Exception as e:
                logger.warning(f"Failed to close MCP tool: {e}")

        self.mcp_tools.clear()
