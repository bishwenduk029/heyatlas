"""
HeyAtlas Voice Agent Entry Point

Three-tier voice assistant system based on pricing plans:
- Genin: Basic (free tier) - No memory, no MCP
- Chunin: Pro (memory + web search) - Memory + MCP servers
- Jonin: Elite (full cloud computer) - Memory + MCP + E2B

Uses registry pattern for clean assistant instantiation.

Console mode (for local testing with Atlas):
  uv run main.py console
"""

import logging
import os
import sys

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import JobContext, RoomInputOptions
from livekit.agents.voice import room_io

from assistants import create_assistant
from utils import get_user_virtual_key, parse_job_metadata

logger = logging.getLogger(__name__)
load_dotenv(".env")


def is_console_mode() -> bool:
    """Check if running in console/dev mode for local Atlas testing.
    
    Set ATLAS_CONSOLE_MODE=1 to enable:
      ATLAS_CONSOLE_MODE=1 uv run main.py console
    """
    return os.getenv("ATLAS_CONSOLE_MODE") == "1"


async def entrypoint(ctx: JobContext):
    """Main entry point for voice agent."""
    job_metadata = parse_job_metadata(ctx.job.metadata)
    user_id = job_metadata.get("user_id") or "test-user"

    # Console mode: use experimental GeninLocalAssistant with Atlas
    if is_console_mode():
        from experimental.genin_local import GeninLocalAssistant

        logger.info("🧪 Console mode: Using GeninLocalAssistant with Atlas")
        assistant = GeninLocalAssistant(user_id=user_id)
        await assistant.connect_to_party_relay()
    else:
        # Production mode: use tier-based assistant
        bifrost_key, pricing_plan = await get_user_virtual_key(user_id)
        logger.info(f"🎯 Assistant: {pricing_plan}")

        assistant = create_assistant(
            tier=pricing_plan,
            user_id=user_id,
            room=ctx.room,
            bifrost_key=bifrost_key,
        )
        await assistant.connect_to_remote_agents_room()

    def handle_text_input(agent_session, event: room_io.TextInputEvent) -> None:
        """Handle text input from LiveKit chat stream."""
        agent_session.interrupt()
        agent_session.generate_reply(user_input=event.text)

    # Start the session
    await assistant.agent_session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(text_input_cb=handle_text_input),
    )

    # Start background audio (skip in console mode if no audio files)
    if not is_console_mode():
        await assistant.background_audio.start(
            room=ctx.room, agent_session=assistant.agent_session
        )
        await assistant.background_audio.play("audio/startup.mp3")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agents.cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name="heyatlas-agent-dev")
    )
