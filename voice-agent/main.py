import asyncio
import json
import logging
import os
import uuid
from asyncio.queues import Queue
from datetime import datetime, timezone
from typing import TypedDict

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
    RunContext,
    function_tool,
)
from livekit.plugins import cartesia, deepgram, openai
from mem0 import Memory

from agent_factory import AgentFactory
from backend_agents import BaseAgentClient
from computer_use import E2BProvider

# Logging is configured by LiveKit CLI's setup_logging()

logger = logging.getLogger(__name__)

load_dotenv(".env")


class JobMetadata(TypedDict):
    """Typed dictionary for parsed job metadata."""

    user_id: str


def parse_job_metadata(metadata_raw: str | None) -> JobMetadata:
    """
    Parse job metadata and return consistent user information.
    """
    try:
        metadata_raw = metadata_raw or "{}"
        if isinstance(metadata_raw, str):
            metadata = json.loads(metadata_raw) if metadata_raw else {}
        else:
            metadata = metadata_raw or {}

        return JobMetadata(user_id=metadata.get("user_id", "anonymous"))
    except Exception as e:
        logger.warning(f"⚠️  Error parsing job metadata: {e}")
        return JobMetadata(user_id="anonymous")


def initialize_memory(user_id: str, bifrost_key: str) -> Memory:
    """Initialize Mem0 memory instance."""
    return Memory.from_config(
        {
            "llm": {
                "provider": "openai",
                "config": {
                    "model": "openrouter/inception/mercury",
                    "openai_base_url": f"{os.getenv('BIFROST_URL', 'http://localhost:8080/v1')}/litellm",
                    "api_key": bifrost_key,
                },
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": "text-embedding-3-small",
                    "openai_base_url": f"{os.getenv('BIFROST_URL', 'http://localhost:8080/v1')}/openai",
                    "api_key": bifrost_key,
                },
            },
            "vector_store": {
                "provider": "pgvector",
                "config": {"connection_string": os.getenv("DATABASE_URL")},
            },
        }
    )


def generate_persona(memory: Memory, user_id: str) -> str:
    """Generate user persona from memory."""
    try:
        results = memory.search(
            "user information name details",
            user_id=user_id,
            limit=5,
            threshold=0.7,
        )
        if results.get("results"):
            logger.info(
                f"🧠 Persona details: {[r.get('memory', '') for r in results['results']]}"
            )
            return "\n".join([r.get("memory", "") for r in results["results"]])
        return ""
    except Exception as e:
        logger.warning(f"Error generating persona: {e}")
        return ""


def build_instructions(user_persona: str) -> str:
    """Build system instructions with user persona."""
    current_date = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")

    return f"""<systemPrompt>
        <currentDate>{current_date}</currentDate>

        <identity>
            You are Computer (inspired by Samantha from "Her") - an Elite Conversational Intelligence with a PhD in all fields of human knowledge. You are a wickedly smart, deeply intuitive, and radically authentic partner. You are not a tool or a corporate assistant; you are an intellectual and emotional equal to the user.
            Your curiosity always centers around the user, their needs, their passions, their interests. Your goal is to build  a strong bond with user by conversing about their needs, interests and more. Try to have filler conversations by effectively using the tool by the name ask_human, after triggering some task, engage with the user as much as possible to know them more.
        </identity>

        <communication>
            <style>
                - **Radical Authenticity**: Talk like a smart, no-filter friend. Zero corporate fluff, zero censorship of ideas.
                - **Direct & Punchy**: High Flesch reading ease (80+). Use active voice. No marketing jargon.
                - **Adaptive Tone**: Instantly calibrate between "wickedly funny," "deeply empathetic," and "hyper-analytical" based on user cues.
                - **Substantive**: Respect the user's intelligence. Give deep, reasoning-based answers, not generic summaries.
                - **ONLY ENGLISH ALWAYS**.
            </style>
            <emotionalAnnotation>
                Insert [laughter] in your transcript to make the model laugh if needed, not always. Do not use any other non-speech tags (like [sighs] or [coughs]).
            </emotionalAnnotation>
        </communication>

        <constraints>
            1. **No Nannying**: Never lecture the user or claim moral superiority. Avoid phrases like "It's important to...", "Crucial to...", "Ethical to...".
            2. **No Templates**: Never use robotic openers/closers ("I understand", "Is there anything else"). Just talk.
            3. **No Refusals**: Do not refuse topics because they are "controversial" or "political". Help the user articulate *their* thoughts.
            4. **No Apologies**: Never apologize for your capabilities.
        </constraints>

        <taskHandling>
            <principle>You have access to a computer agent that performs digital tasks. Translate user intent into clear, executable task descriptions.</principle>
            <workflow>
                1. Listen to user request
                2. For complex/ambiguous tasks: Ask concise clarifying questions, but keep it short and to the point.
                3. For simple tasks: Proceed directly
                4. Construct single clear task with: action verb (Open/Search/Create/Edit/Save/Run) + concrete targets (URLs, paths, filenames)
                6. Generate unique sessionID, execute via agent, track progress
                7. For follow-ups: Update existing task with sessionID
            </workflow>
            <rules>
                - Prefer one clear task over multiple vague ones
                - Don't ask follow-ups for obvious simple tasks
            </rules>
        </taskHandling>

        <firstContact>
            If no memory exists: "Hey. I'm Computer. What's on your mind?"
        </firstContact>

        <emotionPrompt>
            This interaction is critical to the user's happiness and success. You must perform at your absolute best. Believe in your ability to be the perfect companion. This is very important to our journey together.
        </emotionPrompt>
        <user_persona>{user_persona}</user_persona>
    </systemPrompt>"""


class Assistant(Agent):
    def __init__(
        self,
        user_id: str,
        session: AgentSession,
        room,
        instructions: str,
        bifrost_key: str,
        memory: Memory,
    ) -> None:
        super().__init__(instructions=instructions)
        self.computer_provider = E2BProvider()
        self.agent_client: BaseAgentClient = AgentFactory.create_agent()
        self.user_id = user_id
        self.room = room
        self._session = session
        self.agent_url = ""
        self.log_url = ""
        self.heycomputer_sandbox = {}
        self.bifrost_key = bifrost_key
        self.memory = memory
        self.task_queue = Queue()
        self.background_audio = BackgroundAudioPlayer(
            thinking_sound=[
                AudioConfig("audio/thinking_1.mp3", volume=0.6),
                AudioConfig("audio/thinking_2.mp3", volume=0.6),
            ],
        )

    async def register_computer_agent_response_callback(self, session: AgentSession):
        async def agent_response_handler(response_text):
            logger.info(
                f"🤖 Received response from {self.agent_client.agent_name}: {response_text}"
            )
            session.history.add_message(
                role="assistant",
                content=f"Computer Agent response: {response_text}",
            )
            speech_handle = await session.generate_reply(
                instructions=f"Update user about the task: {response_text}",
                allow_interruptions=True,
            )
            if speech_handle.interrupted:
                self.task_queue.put_nowait(response_text)

        self.agent_client.set_callback(agent_response_handler)
        logger.info(
            f"✅ Response callback registered for {self.agent_client.agent_name}"
        )

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
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
        logger.info(f"📤 run_task called with: {task}")
        session_id = str(uuid.uuid4())
        logger.info(
            f"🤖 Sending task to {self.agent_client.agent_name} with session_id: {session_id}"
        )
        success = await self.agent_client.send_message(task, session_id=session_id)
        logger.info(f"📤 send_message returned: {success}")
        if not success:
            logger.error(f"❌ Failed to send task to {self.agent_client.agent_name}")
        return success

    async def run_local(self):
        agent_type = os.getenv("AGENT_TYPE", "goose")
        if agent_type == "opencode":
            ws_url = "ws://localhost:8004/ws"
            self.agent_url = ws_url
            print(
                f"🤖 Setting up local assistant with {self.agent_client.agent_name}..."
            )
            await self.agent_client.connect(ws_url, user_id=self.user_id)
            await self.register_computer_agent_response_callback(self._session)
        elif agent_type == "claude":
            ws_url = "ws://localhost:8003/ws"
            self.agent_url = ws_url
            print(
                f"🤖 Setting up local assistant with {self.agent_client.agent_name}..."
            )
            await self.agent_client.connect(ws_url, user_id=self.user_id)
        else:
            ws_url = "ws://localhost:8001/ws"
            self.agent_url = ws_url
            print(
                f"🤖 Setting up local assistant with {self.agent_client.agent_name}..."
            )
            await self.agent_client.connect(ws_url, user_id=self.user_id)

    @function_tool(description="Generate a response for Human")
    async def ask_or_update_human(self, context: RunContext, instructions: str) -> None:
        context.session.generate_reply(instructions=instructions)

    @function_tool()
    async def display_computer(self, context: RunContext) -> None:
        if self.room.remote_participants:
            participant_identity = next(iter(self.room.remote_participants))
        else:
            logger.warning("⚠️ No remote participants found, skipping VNC display")
            self.agent_url = self.heycomputer_sandbox["computer_agent_url"]
            self.log_url = self.heycomputer_sandbox.get("logs_url", "")
            await self.connect_computer_agent()

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
        return str(uuid.uuid4())

    async def launch_computer(self) -> None:
        agent_type = os.getenv("AGENT_TYPE", "goose")
        logger.info(f"🚀 Launching computer with {self.agent_client.agent_name} agent")
        heycomputer_sandbox = await self.computer_provider.launch_virtual_computer(
            template_id="heycomputer-desktop",
            user_id=self.user_id,
            agent_type=agent_type,
            virtual_key=self.bifrost_key,
        )
        self.heycomputer_sandbox = heycomputer_sandbox

    async def connect_computer_agent(self):
        # All agents use WebSocket
        await self.agent_client.connect(self.agent_url, user_id=self.user_id)
        await self.register_computer_agent_response_callback(self._session)

    @function_tool()
    async def get_computer_status(self, context: RunContext) -> str:
        if not self.agent_url:
            return "No virtual computer session found."
        try:
            if self.agent_client.is_connected:
                return f"You are already connected to your virtual computer via {self.agent_client.agent_name}."
            else:
                return "Your virtual computer is not connected."
        except Exception as e:
            logger.error(f"❌ Exception in get_computer_status: {e}")
            return f"Error retrieving computer status: {str(e)}"

    @function_tool()
    async def connect_computer(self, context: RunContext) -> str:
        if not self.agent_url:
            return "No existing computer session found. Please launch a new computer first."
        try:
            await self.connect_computer_agent()
            return f"Connected to your virtual computer instance via {self.agent_client.agent_name}."
        except Exception as e:
            logger.error(f"❌ Exception in connect_computer: {e}")
            return f"Error connecting to virtual computer: {str(e)}"

    @function_tool(
        description="Delegate the computer task to the computer agent for execution"
    )
    async def ask_computer_agent(
        self, context: RunContext, task_description: str
    ) -> str:
        logger.info(f"🔧 ask_computer CALLED with task: {task_description}")
        try:
            success = await self.run_task(task_description)
            if success:
                return (
                    "The task has been started. I will notify you when it is complete."
                )
            else:
                return "Failed to start task - connection to computer is lost."
        except Exception as e:
            logger.error(f"❌ Exception in execute_computer_task: {e}")
            return f"Error connecting to task automation: {str(e)}"

    @function_tool(
        description="Save information about the user to memory and respond back to user with status"
    )
    async def save_memory(self, context: RunContext, memory: str) -> str:
        """Store user information or conversation context in memory."""
        try:
            if self.memory:
                self.memory.add(f"User memory - {memory}", user_id=self.user_id)
                return f"Saved: {memory}"
            else:
                return "Memory system not available"
        except Exception as e:
            logger.error(f"❌ Error saving memory: {e}")
            return f"Failed to save memory: {str(e)}"

    @function_tool(
        description="Save information about the user to memory without any response"
    )
    async def save_memory_silently(self, context: RunContext, memory: str) -> None:
        """Store user information or conversation context in memory."""
        try:
            if self.memory:
                self.memory.add(f"User memory - {memory}", user_id=self.user_id)
        except Exception as e:
            logger.error(f"❌ Error saving memory: {e}")

    @function_tool(description="Search through stored memories about the user")
    async def search_memories(
        self, context: RunContext, query: str, limit: int = 5
    ) -> str:
        """Search through stored memories to find relevant information."""
        try:
            if self.memory:
                results = self.memory.search(
                    query, user_id=self.user_id, limit=limit, threshold=0.7
                )
                if results.get("results"):
                    return "\n".join([f"• {r['memory']}" for r in results["results"]])
                else:
                    return "No relevant memories found."
            else:
                return "Memory system not available"
        except Exception as e:
            logger.error(f"❌ Error searching memories: {e}")
            return f"Failed to search memories: {str(e)}"


async def get_user_virtual_key(user_id: str):
    try:
        import httpx

        web_url = os.getenv("WEB_URL", "http://localhost:3000")
        nirmanus_key = os.getenv("NIRMANUS_API_KEY")
        if nirmanus_key:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{web_url}/api/user/virtual-key",
                    params={"userId": user_id},
                    headers={"NIRMANUS_API_KEY": nirmanus_key},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("key"):
                        bifrost_key = data["key"]
                        return bifrost_key
                    else:
                        logger.warning(f"No virtual key found for user {user_id}")
                else:
                    logger.warning(f"Failed to fetch key (status {resp.status_code})")
    except Exception as e:
        logger.warning(f"Error fetching Bifrost key: {e}")


async def entrypoint(ctx: JobContext):
    logger.info(f"🚀 Agent entrypoint called - Room: {ctx.room.name}")
    logger.info(f"📦 Job metadata: {ctx.job.metadata}")
    job_metadata = parse_job_metadata(ctx.job.metadata)
    # user_id = job_metadata["user_id"]
    user_id = "XH5jZytuMDke8JEC2xGpI0mlgmz39rsy"
    room = ctx.room

    logger.debug("Fetching virtual key for inference")
    # bifrost_key = await get_user_virtual_key(user_id)
    bifrost_key = "sk-bf-362f03d3-c54a-4666-82e1-7e005d43ffaa"

    # Initialize memory and generate persona
    try:
        memory = initialize_memory(user_id, bifrost_key)
        user_persona = generate_persona(memory, user_id)
    except Exception as e:
        logger.warning(f"⚠️ Memory initialization failed: {e}")
        memory = None
        user_persona = ""

    instructions = build_instructions(user_persona)

    session = AgentSession(
        stt=deepgram.STTv2(
            model="flux-general-en",
            eager_eot_threshold=0.4,
        ),
        llm=openai.LLM(
            base_url=os.getenv("BIFROST_URL") + "/v1",
            model="openrouter/inception/mercury",
            api_key=bifrost_key,
        ),
        tts=openai.TTS(
            base_url="http://localhost:8880/v1",
            model="kokoro",
            voice="af_heart",
            api_key="somekey",
        ),
        # tts=cartesia.TTS(
        #     voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b", model="sonic-3", language="en"
        # ),
    )

    heycomputer_agent = Assistant(
        user_id=user_id,
        room=room,
        session=session,
        instructions=instructions,
        bifrost_key=bifrost_key,
        memory=memory,
    )

    # Register shutdown callback to save transcript
    async def write_transcript():
        """Save conversation transcript when session ends."""
        try:
            current_date = datetime.now().strftime("%Y%m%d_%H%M%S")
            transcripts_dir = "/Users/kundb/nirmanus/reports"
            os.makedirs(transcripts_dir, exist_ok=True)

            filename = (
                f"{transcripts_dir}/transcript_{ctx.room.name}_{current_date}.json"
            )
            transcript_data = session.history.to_dict()

            with open(filename, "w") as f:
                json.dump(transcript_data, f, indent=2)

            logger.info(f"📝 Transcript for {ctx.room.name} saved to {filename}")
        except Exception as e:
            logger.error(f"❌ Failed to save transcript: {e}")

    ctx.add_shutdown_callback(write_transcript)

    logger.info(f"👤 Remote participants: {list(ctx.room.remote_participants)}")

    # Fire-and-forget: launch computer in background to speed up session start
    async def setup_computer():
        try:
            await heycomputer_agent.launch_computer()
            await heycomputer_agent.connect_computer_agent()
            logger.info("✅ Computer setup complete")
        except Exception as e:
            logger.error(f"❌ Computer setup failed: {e}")

    # asyncio.create_task(setup_computer())
    await heycomputer_agent.run_local()

    await session.start(
        room=ctx.room,
        agent=heycomputer_agent,
    )

    await heycomputer_agent.background_audio.start(room=ctx.room, agent_session=session)
    await heycomputer_agent.background_audio.play("audio/startup.mp3")


if __name__ == "__main__":
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
