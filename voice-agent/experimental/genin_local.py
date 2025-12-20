"""Experimental GeninLocalAssistant for Atlas

Works with the experimental Atlas setup:
- Transport (PartyKit) on localhost:1999
- Atlas Agent (Cloudflare) on localhost:8787
- Uses tunnel to receive task updates from CLI
"""

import logging
import os
from asyncio.queues import Queue

from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    ChatContext,
    ChatMessage,
)
from livekit.plugins import deepgram, openai

from backend_agents.remote_tunnel import RemoteTunnel

logger = logging.getLogger(__name__)

# Atlas endpoints
TRANSPORT_URL = os.getenv("ATLAS_TRANSPORT_URL", "http://localhost:1999")
ATLAS_AGENT_URL = os.getenv("ATLAS_AGENT_URL", "http://localhost:8787")


class GeninLocalAssistant(Agent):
    """
    Experimental assistant using Atlas (Cloudflare Agent + Transport).

    - Atlas Agent handles LLM + tool execution (ask_computer_agent)
    - Transport handles WebSocket relay for task updates
    - Tunnel receives task-update messages from CLI
    """

    def __init__(self, user_id: str = "test-user") -> None:
        super().__init__(
            instructions="You are Atlas. Keep responses concise and helpful."
        )

        self.user_id = user_id
        self.task_queue: Queue[str] = Queue()

        # Tunnel for receiving task updates from CLI via Transport
        self.tunnel = RemoteTunnel(api_key=os.getenv("NIRMANUS_API_KEY"))

        self.background_audio = BackgroundAudioPlayer(
            thinking_sound=[
                AudioConfig("audio/thinking_1.mp3", volume=0.6),
                AudioConfig("audio/thinking_2.mp3", volume=0.6),
            ],
        )

        # Atlas Agent exposes OpenAI-compatible endpoint at /{userId}/v1/chat/completions
        atlas_base_url = f"{ATLAS_AGENT_URL}/{user_id}/v1"

        self.agent_session = AgentSession(
            stt=deepgram.STTv2(
                model="flux-general-en",
                eager_eot_threshold=0.4,
            ),
            llm=openai.LLM(
                base_url=atlas_base_url,
                model="atlas",
                api_key="atlas-local",
            ),
            tts=openai.TTS(
                base_url=os.getenv("VOICE_AGENT_TTS_PROVIDER"),
                model=os.getenv("VOICE_AGENT_TTS"),
                voice="tara",
                speed="1.0",
                api_key=os.getenv("VOICE_AGENT_TTS_PROVIDER_KEY"),
            ),
            mcp_servers=[],
        )

    async def connect_to_party_relay(self):
        """Connect tunnel to Transport for receiving task updates (optional)."""
        try:
            self.tunnel.host = TRANSPORT_URL.replace("http://", "").replace(
                "https://", ""
            )
            await self.tunnel.connect_to_room(
                self.user_id, agent_id="voice-agent", role="voice"
            )
            await self._register_task_update_callback()
            logger.info(f"[Atlas] Connected to Transport room: {self.user_id}")
        except Exception as e:
            logger.warning(
                f"[Atlas] Transport not available, skipping task updates: {e}"
            )
            self.tunnel = None

    async def _register_task_update_callback(self):
        """Register callback to handle task updates from CLI."""

        async def task_update_handler(response_text: str):
            logger.info(f"[Atlas] Task update received: {response_text[:50]}...")

            self.agent_session.history.add_message(
                role="assistant",
                content=f"Computer Agent response: {response_text}",
            )

            # Queue update or speak immediately based on agent state
            if self.agent_session.agent_state in ("speaking", "thinking"):
                self.task_queue.put_nowait(response_text)
            else:
                speech_handle = await self.agent_session.generate_reply(
                    instructions=f"Update user about the task: {response_text}",
                    allow_interruptions=True,
                )
                if speech_handle.interrupted:
                    self.task_queue.put_nowait(response_text)

        self.tunnel.sub(task_update_handler)

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        """Handle pending task updates after user turn completes."""
        if self.task_queue.empty():
            return

        recent_task_update = self.task_queue.get_nowait()
        self.agent_session.history.add_message(
            role="assistant",
            content=f"Computer Agent response: {recent_task_update}",
        )
        task_update_message = f"Update the user about this task: {recent_task_update}"
        turn_ctx.add_message(role="assistant", content=task_update_message)
        await self.update_chat_ctx(turn_ctx)

    async def disconnect(self):
        """Clean up tunnel connection."""
        if self.tunnel:
            await self.tunnel.disconnect()
