"""
JoninAssistant - Atlas with Cloud Computer Access (Tier 3)

Jonin - Elite Ninja Rank:
- Inherits memory & MCP from Chunin
- Adds E2B cloud computer capabilities
- Full virtual desktop control
- E2B sandbox management
- Maps to: Max pricing plan
"""

import json
import logging
import os
import uuid

from livekit.agents import AgentSession, RunContext, function_tool
from mem0 import MemoryClient

from .chunin import ChuninAssistant
from .context import AssistantContext
from .registry import register_assistant
from computer_use import E2BProvider

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
        # Call parent (Chunin) init - sets up memory, MCP, session
        super().__init__(ctx)

        # Override with Chunin/Jonin instructions
        from utils.instructions import build_chunin_jonin_instructions
        from utils.user import generate_persona

        user_persona = generate_persona(self.memory, ctx.user_id) if self.memory else ""
        instructions = build_chunin_jonin_instructions(user_persona=user_persona)

        # Override instructions
        self.instructions = instructions

        # Add E2B-specific components
        self.computer_provider = E2BProvider()
        self.agent_url = ""
        self.log_url = ""
        self.heycomputer_sandbox = {}

        logger.info(f"🎯 Jonin tier initialized with E2B capabilities")

    @function_tool()
    async def display_computer(self, context: RunContext) -> None:
        """Display VNC stream to frontend."""
        if self.room.remote_participants:
            participant_identity = next(iter(self.room.remote_participants))
        else:
            logger.warning("⚠️ No remote participants found, skipping VNC display")
            self.agent_url = self.heycomputer_sandbox["computer_agent_url"]
            self.log_url = self.heycomputer_sandbox.get("logs_url", "")
            await self.connect_computer_agent()
            return

        self.agent_url = self.heycomputer_sandbox["computer_agent_url"]
        self.log_url = self.heycomputer_sandbox.get("logs_url", "")
        vnc_url = self.heycomputer_sandbox["vnc_url"]
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
            logger.info(f"🖥️  Successfully sent VNC URL to frontend: {vnc_url}")
        except Exception as e:
            logger.error(f"❌ Failed to send VNC URL to frontend: {e}")

        await self.connect_computer_agent()

    @function_tool()
    async def create_computer_session(self, context: RunContext) -> str:
        """Create a new computer session."""
        return str(uuid.uuid4())

    async def launch_computer(self) -> None:
        """Launch virtual computer with E2B."""
        agent_type = os.getenv("AGENT_TYPE", "goose")
        logger.info(f"🚀 Launching computer with agent: {agent_type}")
        heycomputer_sandbox = await self.computer_provider.launch_virtual_computer(
            template_id="heycomputer-desktop",
            user_id=self.user_id,
            agent_type=agent_type,
            virtual_key=self.bifrost_key,
        )
        self.heycomputer_sandbox = heycomputer_sandbox

    async def connect_computer_agent(self):
        """Connect to agent via relay room (for E2B sandbox scenario)."""
        await self.tunnel.connect(self.agent_url, agent_id="voice-agent")
        await self.register_computer_agent_response_callback(self._session)

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
            logger.error(f"❌ Exception in get_computer_status: {e}")
            return f"Error retrieving computer status: {str(e)}"

    @function_tool()
    async def connect_computer(self, context: RunContext) -> str:
        """Connect to existing virtual computer."""
        if not self.agent_url:
            return "No existing computer session found. Please launch a new computer first."
        try:
            await self.connect_to_party_relay()
            return "Connected to your virtual computer instance."
        except Exception as e:
            logger.error(f"❌ Exception in connect_to_party_relay: {e}")
            return f"Error connecting to virtual computer: {str(e)}"
