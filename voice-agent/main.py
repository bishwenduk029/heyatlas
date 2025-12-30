"""
HeyAtlas Voice Agent

Voice assistant that uses Atlas (Cloudflare Agent) for LLM processing.
All intelligence lives in Atlas - this agent handles voice I/O only.
"""

import logging
import os
from asyncio.queues import Queue
from typing import Optional

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    ChatContext,
    ChatMessage,
    JobContext,
    RoomInputOptions,
)
from livekit.agents.voice import room_io
from livekit.plugins import deepgram, openai

from tunnel import AtlasTunnel
from utils import parse_job_metadata
from utils.metadata import get_user_virtual_key

load_dotenv(".env")
logger = logging.getLogger(__name__)


class VoiceAssistant(Agent):
    """Voice assistant using Atlas for LLM processing."""

    def __init__(self, user_id: str, room, virtual_key: Optional[str] = None):
        super().__init__(
            instructions="You are Atlas. Keep responses concise and helpful."
        )

        self.user_id = user_id
        self.room = room
        self.task_queue: Queue[str] = Queue()
        self.virtual_key = virtual_key

        atlas_url = os.getenv("ATLAS_AGENT_URL", "http://agent.heyatlas.app")
        nirmanus_key = os.getenv("NIRMANUS_API_KEY", "")

        # Tunnel for receiving task updates from Atlas (uses server API key)
        self.tunnel = AtlasTunnel(base_url=atlas_url, api_key=nirmanus_key)

        # Background audio for thinking sounds
        self.background_audio = BackgroundAudioPlayer()

        # Auth headers for Atlas voice agent (server-to-server auth)
        auth_headers = {
            "X-Api-Key": nirmanus_key,
            "X-Agent-Role": "voice",
        }

        # Agent session with Atlas as LLM backend
        self.agent_session = AgentSession(
            stt=deepgram.STTv2(model="flux-general-en", eager_eot_threshold=0.4),
            llm=openai.LLM(
                model="atlas",
                base_url=f"{atlas_url}/agents/atlas-agent/{user_id}/v1",
                api_key=self.virtual_key or "atlas-local",
                extra_headers=auth_headers,
            ),
            tts=openai.TTS(
                base_url=os.getenv("VOICE_PROVIDER_URL"),
                model=os.getenv("VOICE_PROVIDER_MODEL"),
                voice="tara",
                speed="1.0",
                api_key=os.getenv("VOICE_PROVIDER_KEY"),
            ),
            mcp_servers=[],
        )

    async def connect_tunnel(self):
        """Connect to Atlas for task updates."""
        try:
            await self.tunnel.connect(self.user_id)
            self.tunnel.on_message(self._on_task_update)
            self.tunnel.on_voice_response(self._voice_response_callback)
            logger.info(f"[Atlas] Connected to agent room: {self.user_id}")
        except Exception as e:
            logger.warning(f"[Atlas] Could not connect tunnel: {e}")

    async def _on_task_update(self, content: str):
        """Handle task update from Atlas (e.g., from CLI or sandbox agent)."""
        logger.info(f"[Atlas] Task update: {content[:50]}...")

        if self.agent_session.agent_state in ("speaking", "thinking"):
            self.task_queue.put_nowait(content)
        else:
            handle = await self.agent_session.generate_reply(
                instructions=f"Update user about the task: {content}",
                allow_interruptions=True,
            )
            if handle.interrupted:
                self.task_queue.put_nowait(content)

    async def _voice_response_callback(self, content: str):
        """Handle task update from Atlas (e.g., from CLI or sandbox agent)."""
        logger.info(f"[Atlas] Task update: {content[:50]}...")

        if self.agent_session.agent_state in ("speaking", "thinking"):
            self.task_queue.put_nowait(content)
        else:
            handle = await self.agent_session.say(
                content, allow_interruptions=True, add_to_chat_ctx=False
            )
            if handle.interrupted:
                self.task_queue.put_nowait(content)

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ):
        """Handle pending task updates after user finishes speaking."""
        if self.task_queue.empty():
            return

        update = self.task_queue.get_nowait()
        self.agent_session.history.add_message(
            role="assistant",
            content=f"Computer Agent response: {update}",
        )
        turn_ctx.add_message(
            role="assistant", content=f"Update the user about this task: {update}"
        )
        await self.update_chat_ctx(turn_ctx)

    async def disconnect(self):
        """Clean up connections."""
        await self.tunnel.disconnect()


async def entrypoint(ctx: JobContext):
    """Main entry point for voice agent."""
    metadata = parse_job_metadata(ctx.job.metadata)
    user_id = metadata.get("user_id", "test-user")

    # Fetch user's virtual key (bifrost key) for LLM token gating
    virtual_key, tier = await get_user_virtual_key(user_id)
    logger.info(
        f"[Atlas] User {user_id}: virtual_key={'set' if virtual_key else 'NOT SET'}, tier={tier}"
    )

    assistant = VoiceAssistant(user_id=user_id, room=ctx.room, virtual_key=virtual_key)
    await assistant.connect_tunnel()

    def on_text_input(session, event: room_io.TextInputEvent):
        """Handle text input from LiveKit chat."""
        session.interrupt()
        session.generate_reply(user_input=event.text)

    await assistant.agent_session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(text_input_cb=on_text_input),
    )

    await assistant.background_audio.start(
        room=ctx.room, agent_session=assistant.agent_session
    )
    await assistant.background_audio.play("audio/startup.mp3")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agents.cli.run_app(
        agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name="heyatlas-agent-dev")
    )
