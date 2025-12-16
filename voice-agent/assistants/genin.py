"""
GeninAssistant - Basic Voice Assistant (Tier 1)

Genin - Beginner Ninja Rank:
- Simple voice interaction
- Single tool: ask_computer_agent for basic task delegation
- No memory capabilities
- No MCP server support
- Maps to: Free pricing plan
"""

import logging
import os
import uuid
from asyncio.queues import Queue

from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    ChatContext,
    ChatMessage,
    RunContext,
    function_tool,
)
from livekit.plugins import deepgram, openai

from backend_agents.remote_tunnel import RemoteTunnel
from utils.instructions import build_sales_instructions

from .context import AssistantContext
from .registry import register_assistant

logger = logging.getLogger(__name__)


@register_assistant("genin")
class GeninAssistant(Agent):
    """
    Tier 1: Basic Voice Assistant
    - Basic task delegation via remote tunnel
    - No memory, no MCP servers
    """

    def __init__(self, ctx: AssistantContext) -> None:
        # Unpack context
        self.user_id = ctx.user_id
        self.room = ctx.room
        self.bifrost_key = ctx.bifrost_key

        instructions = build_sales_instructions()
        super().__init__(instructions=instructions)

        # Initialize internal components
        self.tunnel = RemoteTunnel()
        self.task_queue = Queue()
        self.background_audio = BackgroundAudioPlayer(
            thinking_sound=[
                AudioConfig("audio/thinking_1.mp3", volume=0.6),
                AudioConfig("audio/thinking_2.mp3", volume=0.6),
            ],
        )

        # Create session internally
        logger.info(f"🎯 Creating Genin session for user: {user_id}")
        logger.info(f"⚠️  Memory disabled for Genin tier")
        logger.info(f"⚠️  MCP servers disabled for Genin tier")

        self.session = AgentSession(
            stt=deepgram.STTv2(
                model="flux-general-en",
                eager_eot_threshold=0.4,
            ),
            llm=openai.LLM(
                base_url=os.getenv("BIFROST_URL") + "/v1",
                model=os.getenv("VOICE_AGENT_LLM"),
                api_key=bifrost_key,
            ),
            tts=openai.TTS(
                base_url=os.getenv("VOICE_AGENT_TTS_PROVIDER"),
                model=os.getenv("VOICE_AGENT_TTS"),
                voice="tara",
                speed="1.0",
                api_key=os.getenv("VOICE_AGENT_TTS_PROVIDER_KEY"),
            ),
            mcp_servers=[],  # No MCP servers for Genin
        )

        # Keep reference for compatibility
        self._session = self.session

    async def register_computer_agent_response_callback(self, session: AgentSession):
        """Register callback to handle responses from computer agent."""

        async def agent_response_handler(response_text):
            logger.info(f"🤖 Received response from tunnel: {response_text}")
            session.history.add_message(
                role="assistant",
                content=f"Computer Agent response: {response_text}",
            )

            # If agent is busy, queue for later; otherwise speak immediately
            if session.agent_state == "speaking" or session.agent_state == "thinking":
                logger.info("Agent busy, queuing response for later")
                self.task_queue.put_nowait(response_text)
            else:
                speech_handle = await session.generate_reply(
                    instructions=f"Update user about the task: {response_text}",
                    allow_interruptions=True,
                )
                if speech_handle.interrupted:
                    self.task_queue.put_nowait(response_text)

        self.tunnel.sub(agent_response_handler)
        logger.info("✅ Subscribed to tunnel messages")

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        """Handle pending task updates after user turn completes."""
        if self.task_queue.empty():
            logger.info("No pending task updates to report.")
            return

        recent_task_update = self.task_queue.get_nowait()
        logger.info(f"📝 Reporting task update to user: {recent_task_update}")
        self.session.history.add_message(
            role="assistant",
            content=f"Computer Agent response: {recent_task_update}",
        )
        task_update_message = f"Update the user about this task: {recent_task_update}"
        turn_ctx.add_message(role="assistant", content=task_update_message)
        await self.update_chat_ctx(turn_ctx)

    async def run_task(self, task: str):
        """Publish task to remote tunnel for execution."""
        logger.info(f"📤 run_task called with: {task}")
        session_id = str(uuid.uuid4())
        logger.info(f"🤖 Publishing task with session_id: {session_id}")
        success = await self.tunnel.pub(task, session_id=session_id)
        logger.info(f"📤 pub returned: {success}")
        if not success:
            logger.error("❌ Failed to publish task")
        return success

    async def connect_to_party_relay(self):
        """Connect to relay room for task routing using user_id as room name."""
        import os

        party_host = os.getenv("PARTY_HOST")
        self.tunnel.host = party_host

        logger.info(f"🤖 Connecting to room: {self.user_id}...")
        await self.tunnel.connect_to_room(
            self.user_id, agent_id="voice-agent", role="voice"
        )
        await self.register_computer_agent_response_callback(self._session)
        logger.info(f"✅ Connected to relay room for user: {self.user_id}")

    @function_tool(
        description="Delegate the computer task to the computer agent for execution"
    )
    async def ask_computer_agent(
        self, context: RunContext, task_description: str
    ) -> str:
        """Basic task delegation tool available in Genin tier."""
        logger.info(f"🔧 ask_computer_agent CALLED with task: {task_description}")
        try:
            success = await self.run_task(task_description)
            if success:
                return (
                    "The task has been started. I will notify you when it is complete."
                )
            else:
                return "Failed to start task - connection to computer is lost."
        except Exception as e:
            logger.error(f"❌ Exception in ask_computer_agent: {e}")
            return f"Error connecting to task automation: {str(e)}"
