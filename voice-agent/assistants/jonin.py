"""
JoninAssistant - Atlas with Cloud Computer Access (Tier 3)

Jonin - Elite Ninja Rank:
- Inherits memory & MCP from Chunin
- Adds E2B cloud computer capabilities
- Full virtual desktop control
- E2B sandbox management
- Maps to: Max pricing plan
"""

import asyncio
import json
import logging
import os
import uuid

import httpx
from livekit.agents import RunContext, function_tool

from computer_use import E2BProvider

from .chunin import ChuninAssistant
from .context import AssistantContext
from .registry import register_assistant

logger = logging.getLogger(__name__)


@register_assistant("jonin")
class JoninAssistant(ChuninAssistant):
    """
    Tier 3: Atlas with Cloud Computer Access
    - Inherits memory & MCP from Chunin
    - Adds E2B cloud computer capabilities
    - Full virtual desktop control
    """

    def __init__(self, ctx: AssistantContext) -> None:
        # Call parent (Chunin) init - sets up memory, MCP, session, and instructions
        super().__init__(ctx)

        # Add E2B-specific components
        self.computer_provider = E2BProvider()
        self.agent_url = ""
        self.log_url = ""
        self.heycomputer_sandbox = {}
        self._sandbox_ready = asyncio.Event()

        # Launch E2B sandbox in background
        asyncio.create_task(self._init_sandbox())
        logger.info("✅ Computer capabilities initialized (sandbox launching...)")

    async def _init_sandbox(self) -> None:
        """Initialize E2B sandbox in background."""
        try:
            logger.info("🚀 Launching E2B sandbox...")
            await self.launch_computer()
            self.agent_url = self.heycomputer_sandbox["computer_agent_url"]
            self.log_url = self.heycomputer_sandbox.get("logs_url", "")
            self._sandbox_ready.set()
            logger.info("✅ E2B sandbox ready")
        except Exception as e:
            logger.error(f"❌ Failed to launch E2B sandbox: {e}")
            self._sandbox_ready.set()  # Unblock waiters even on failure

    @function_tool(
        description="Display the virtual cloud computer desktop to the user."
    )
    async def display_computer(self, context: RunContext) -> str:
        """Display VNC stream to frontend."""
        # Wait for sandbox to be ready
        await self._sandbox_ready.wait()

        if not self.heycomputer_sandbox:
            return "Failed to launch virtual computer. Please try again."

        vnc_url = self.heycomputer_sandbox["vnc_url"]

        # Send VNC URL to frontend via RPC
        if self.room.remote_participants:
            participant_identity = next(iter(self.room.remote_participants))
            payload_data = {"vncUrl": vnc_url, "status": "ready"}
            if self.log_url:
                payload_data["logUrl"] = self.log_url
            payload_json = json.dumps(payload_data)

            try:
                await self.room.local_participant.perform_rpc(
                    destination_identity=participant_identity,
                    method="displayVncStream",
                    payload=payload_json,
                    response_timeout=5.0,
                )
                logger.info("✅ VNC stream URL sent to frontend")
            except Exception as e:
                logger.error(f"Failed to send VNC URL: {e}")

        return "Virtual computer is ready. The desktop is now displayed."

    @function_tool()
    async def create_computer_session(self, context: RunContext) -> str:
        """Create a new computer session."""
        return str(uuid.uuid4())

    async def launch_computer(self) -> None:
        """Launch virtual computer with E2B."""
        heycomputer_sandbox = await self.computer_provider.launch_virtual_computer(
            template_id="heycomputer-desktop",
            user_id=self.user_id,
            virtual_key=self.bifrost_key,
        )
        self.heycomputer_sandbox = heycomputer_sandbox

    async def connect_computer_agent(self):
        """Connect to agent via relay room (for E2B sandbox scenario)."""
        await self.tunnel.connect(self.agent_url, agent_id="voice-agent")
        await self.register_computer_agent_response_callback(self.agent_session)

    @function_tool()
    async def get_computer_status(self, context: RunContext) -> str:
        """Get status of virtual computer."""
        if not self.agent_url:
            return "No virtual computer session found."
        try:
            if self.tunnel.is_connected:
                return "You are connected to your virtual computer."
            else:
                return "Your virtual computer is not connected."
        except Exception as e:
            return f"Error retrieving computer status: {str(e)}"

    @function_tool()
    async def connect_computer(self, context: RunContext) -> str:
        """Connect to existing virtual computer."""
        if not self.agent_url:
            return "No existing computer session found. Please launch a new computer first."
        try:
            await self.connect_to_remote_agents_room()
            return "Connected to your virtual computer instance."
        except Exception as e:
            return f"Error connecting to virtual computer: {str(e)}"

    @function_tool(
        description="Delegate the computer task to the computer agent for execution"
    )
    async def ask_computer_agent(
        self, context: RunContext, task_description: str
    ) -> str:
        """Send task to VoltAgent running in E2B sandbox via REST API (overrides parent)."""
        # Wait for sandbox to be ready
        await self._sandbox_ready.wait()

        if not self.agent_url:
            return "Virtual computer is not available. Please try again later."

        async def execute_task():
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    response = await client.post(
                        self.agent_url,
                        json={
                            "input": task_description,
                            "userId": self.user_id,
                        },
                    )
                    response.raise_for_status()
                    result = response.json()
                    output = result.get("output", result.get("text", str(result)))
                    self.task_queue.put_nowait(output)
            except Exception as e:
                logger.error(f"Virtual computer task error: {e}")
                self.task_queue.put_nowait(f"Task failed: {str(e)}")

        asyncio.create_task(execute_task())
        return "Task sent to virtual computer. I will notify you when it completes."
