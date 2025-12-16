"""
HeyAtlas Voice Agent Entry Point

Three-tier voice assistant system based on pricing plans:
- Genin: Basic (free tier) - No memory, no MCP
- Chunin: Pro (memory + web search) - Memory + MCP servers
- Jonin: Elite (full cloud computer) - Memory + MCP + E2B

Uses registry pattern for clean assistant instantiation.
"""

import json
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import JobContext, RoomInputOptions
from livekit.agents.voice import room_io

from assistants import create_assistant
from utils import get_user_virtual_key, parse_job_metadata

logger = logging.getLogger(__name__)
load_dotenv(".env")


async def entrypoint(ctx: JobContext):
    """Main entry point for voice agent."""
    logger.info(f"🚀 Agent entrypoint called - Room: {ctx.room.name}")
    logger.info(f"📦 Job metadata: {ctx.job.metadata}")

    job_metadata = parse_job_metadata(ctx.job.metadata)
    user_id = job_metadata["user_id"]

    bifrost_key, pricing_plan = await get_user_virtual_key(user_id)
    logger.info(f"🎯 Selected Assistant Tier: {pricing_plan}")

    assistant = create_assistant(
        tier=pricing_plan,
        user_id=user_id,
        room=ctx.room,
        bifrost_key=bifrost_key,
    )

    def handle_text_input(agent_session, event: room_io.TextInputEvent) -> None:
        """Handle text input from LiveKit chat stream."""
        logger.info(f"[TextInputHandler] Received: '{event.text}'")
        agent_session.interrupt()
        agent_session.generate_reply(user_input=event.text)

    logger.info(f"👤 Remote participants: {list(ctx.room.remote_participants)}")

    # Connect to relay room for task communication
    await assistant.connect_to_party_relay()

    # Start the session
    await assistant.session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(text_input_cb=handle_text_input),
    )

    # Start background audio
    await assistant.background_audio.start(
        room=ctx.room, agent_session=assistant.session
    )
    await assistant.background_audio.play("audio/startup.mp3")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("🚀 Starting Computer Voice Assistant...")
    logger.info(f"📊 Logging level: {logging.getLogger().level}")
    logger.info(
        f"🌍 Environment: COMPUTER_PROVIDER={os.getenv('COMPUTER_PROVIDER', 'local')}"
    )
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint, agent_name="heycomputer-agent-dev"
        )
    )
