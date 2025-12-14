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
    FunctionToolsExecutedEvent,
    JobContext,
    RoomInputOptions,
    RunContext,
    function_tool,
    mcp,
)
from livekit.agents.voice import room_io
from livekit.plugins import deepgram, openai
from mem0 import Memory

from backend_agents.party_client import PartyClient
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
        # PartyClient for routing tasks through PartyKit relay
        self.party_client = PartyClient()
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
                f"🤖 Received response from {self.party_client.agent_name}: {response_text}"
            )
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

        self.party_client.set_callback(agent_response_handler)
        logger.info(
            f"✅ Response callback registered for {self.party_client.agent_name}"
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
            f"🤖 Sending task to {self.party_client.agent_name} with session_id: {session_id}"
        )
        success = await self.party_client.send_message(task, session_id=session_id)
        logger.info(f"📤 send_message returned: {success}")
        if not success:
            logger.error(f"❌ Failed to send task to {self.party_client.agent_name}")
        return success

    async def connect_to_party_relay(self):
        """Connect to PartyKit relay for task routing using user_id as room name."""
        party_host = os.getenv("PARTY_HOST")
        # Use user_id as room name to join same room as agent-bridge
        party_room = self.user_id

        # Build WebSocket URL for PartyKit with agent identification
        protocol = "wss" if "partykit.dev" in party_host else "ws"
        ws_url = f"{protocol}://{party_host}/parties/main/{party_room}?id=voice-agent&role=voice"
        self.agent_url = ws_url

        logger.info(f"🤖 Connecting to PartyKit relay at {ws_url}...")
        await self.party_client.connect(ws_url, agent_id="voice-agent")
        await self.register_computer_agent_response_callback(self._session)
        logger.info(f"✅ Connected to PartyKit relay for user: {self.user_id}")

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
        logger.info(f"🚀 Launching computer with {self.party_client.agent_name} agent")
        heycomputer_sandbox = await self.computer_provider.launch_virtual_computer(
            template_id="heycomputer-desktop",
            user_id=self.user_id,
            agent_type=agent_type,
            virtual_key=self.bifrost_key,
        )
        self.heycomputer_sandbox = heycomputer_sandbox

    async def connect_computer_agent(self):
        # Connect to agent WebSocket (for E2B sandbox scenario)
        await self.party_client.connect(self.agent_url, agent_id="voice-agent")
        await self.register_computer_agent_response_callback(self._session)

    @function_tool()
    async def get_computer_status(self, context: RunContext) -> str:
        if not self.agent_url:
            return "No virtual computer session found."
        try:
            if self.party_client.is_connected:
                return f"You are already connected to your virtual computer via {self.party_client.agent_name}."
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
            return f"Connected to your virtual computer instance via {self.party_client.agent_name}."
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
    user_id = job_metadata["user_id"]
    bifrost_key = await get_user_virtual_key(user_id)
    room = ctx.room

    # Initialize memory and generate persona
    try:
        memory = initialize_memory(user_id, bifrost_key)
        user_persona = generate_persona(memory, user_id)
    except Exception as e:
        logger.warning(f"⚠️ Memory initialization failed: {e}")
        memory = None
        user_persona = ""

    instructions = build_instructions(user_persona)

    # Configure MCP UI Server with authentication headers
    mcp_ui_server = os.getenv("MCP_UI_SERVER_URL")
    nirmanus_api_key = os.getenv("NIRMANUS_API_KEY", "dev-key-12345")

    session = AgentSession(
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
        mcp_servers=[
            mcp.MCPServerHTTP(
                mcp_ui_server,
                headers={
                    "NIRMANUS_API_KEY": nirmanus_api_key,
                    "X-User-ID": user_id,
                },
            )
        ],
    )

    # Event handler to forward MCP UI resources to frontend via RPC
    @session.on("function_tools_executed")
    def on_function_tools_executed(event: FunctionToolsExecutedEvent):
        """Detect MCP UI tool calls and forward UIResource to frontend via RPC"""

        async def forward_ui_resource(resource: dict, tool_name: str, arguments: dict):
            """Async helper to forward UIResource via RPC"""
            if ctx.room.remote_participants:
                participant_identity = next(iter(ctx.room.remote_participants))

                ui_payload = {
                    "type": "ui_resource",
                    "resource": resource,
                    "toolName": tool_name,
                    "arguments": arguments,
                }

                try:
                    await ctx.room.local_participant.perform_rpc(
                        destination_identity=participant_identity,
                        method="displayMCPUI",
                        payload=json.dumps(ui_payload),
                        response_timeout=5.0,
                    )
                    logger.info(f"✅ Forwarded UIResource to frontend via RPC")
                except Exception as e:
                    logger.error(f"❌ Failed to forward UIResource: {e}")

        for call, output in event.zipped():
            # Check if this is an MCP UI tool
            if "display" in call.name.lower() or "ui" in call.name.lower():
                logger.info(f"🎨 Detected MCP UI tool call: {call.name}")
                logger.info(f"🔍 Raw output (full): {output.output}")

                # Parse the output (it's a JSON string)
                try:
                    result = json.loads(output.output)
                    logger.info(f"🔍 Parsed result keys: {list(result.keys())}")

                    # MCP UI returns resource directly, not in content array
                    if result.get("type") == "resource" and "resource" in result:
                        resource = result.get("resource", {})
                        logger.info(f"🔍 Resource mimeType: {resource.get('mimeType')}")

                        # Check if it's a UI resource (mimeType: text/html)
                        if resource.get("mimeType") == "text/html":
                            logger.info(f"✨ Found UIResource in tool response")

                            # Forward to frontend via RPC (non-blocking)
                            asyncio.create_task(
                                forward_ui_resource(resource, call.name, call.arguments)
                            )
                    else:
                        logger.warning(
                            f"⚠️ Unexpected result structure: {result.get('type')}"
                        )
                except (json.JSONDecodeError, AttributeError) as e:
                    logger.error(f"❌ Failed to parse tool output: {e}")

    heycomputer_agent = Assistant(
        user_id=user_id,
        room=room,
        session=session,
        instructions=instructions,
        bifrost_key=bifrost_key,
        memory=memory,
    )

    # Text input callback handler for MCP UI Server form submissions
    def handle_text_input(
        agent_session: AgentSession, event: room_io.TextInputEvent
    ) -> None:
        """
        Handle text input from LiveKit chat stream (lk.chat topic).
        This receives text from:
        1. Web frontend using sendText()
        2. MCP UI Server form submissions (via postMessage from web page)
        3. Manual text input from users
        """
        message = event.text
        logger.info(f"[TextInputHandler] Received text input from user: '{message}'")

        # Optional: Handle special commands
        if message.startswith("/"):
            if message == "/help":
                agent_session.say("Available commands: /help, /status")
                return
            elif message == "/status":
                agent_session.say("I'm ready and listening")
                return

        # Default behavior: interrupt current speech and generate reply
        # This integrates seamlessly with MCP UI form submissions
        agent_session.interrupt()
        agent_session.generate_reply(user_input=message)

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

    # ctx.add_shutdown_callback(write_transcript)

    logger.info(f"👤 Remote participants: {list(ctx.room.remote_participants)}")

    await session.start(
        room=ctx.room,
        agent=heycomputer_agent,
        room_input_options=RoomInputOptions(text_input_cb=handle_text_input),
    )

    await heycomputer_agent.background_audio.start(room=ctx.room, agent_session=session)
    await heycomputer_agent.background_audio.play("audio/startup.mp3")


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
