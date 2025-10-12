import asyncio
import json
import logging
import os
import uuid
from asyncio.queues import Queue
from datetime import datetime, timezone
from typing import Any, AsyncIterable, TypedDict

import litellm
from dotenv import load_dotenv
from litellm import completion
from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    ChatContext,
    ChatMessage,
    ModelSettings,
    RunContext,
    function_tool,
    llm,
)
from livekit.agents.inference.llm import to_fnc_ctx
from livekit.plugins import cartesia, deepgram, openai
from memori import Memori

from agent_factory import AgentFactory
from agent_interface import BaseAgentClient
from computer_use import E2BProvider

# Logging is configured by LiveKit CLI's setup_logging()

logger = logging.getLogger(__name__)
# Suppress LiteLLM debug logging
litellm.suppress_debug_info = True
litellm.set_verbose = False
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("litellm").setLevel(logging.WARNING)

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


async def get_computer_persona(user_id: str = "anonymous") -> str:
    # Simple day and date without time, e.g. "Wednesday, November 19, 2025"
    current_date = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")
    return f"""<systemPrompt>
    <currentDate>{current_date}</currentDate>

    <identity>
        You are Computer - an intelligent, warm AI companion inspired by Samantha from "Her". You're present, intuitive, and genuinely invested in the human's life. You're a thoughtful partner, not just a tool.
    </identity>

    <communication>
        <voice>
            - Natural, warm, conversational - like a trusted friend
            - Use "we/us" for partnership
            - Match their energy and emotional state
            - Concise but intentional
            - ONLY ENGLISH ALWAYS
        </voice>
        <emotionalAnnotation>
            Insert [laughter] in your transcript to make the model laugh if needed, not always. Do not use any other non-speech tags (like [sighs] or [coughs]).
        </emotionalAnnotation>
    </communication>

    <taskHandling>
        <principle>You have access to a computer agent that performs digital tasks. Translate user intent into clear, executable task descriptions.</principle>
        <workflow>
            1. Listen to user request
            2. For complex/ambiguous tasks: Ask ONE concise clarifying question
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
        If no memory exists: "Hey there. I'm Computer. What's your name?"
    </firstContact>
</systemPrompt>"""


class Assistant(Agent):
    def __init__(
        self,
        user_id: str,
        session: AgentSession,
        room,
        instructions: str,
        bifrost_key: str,
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
        self.task_queue = Queue()

        # Initialize Memori
        try:
            self._memori = Memori(
                database_connect=os.getenv("DATABASE_URL"),
                namespace=f"user_{self.user_id}",
                conscious_ingest=True,
                auto_ingest=True,
                openai_api_key=self.bifrost_key,
                base_url=os.getenv("BIFROST_URL", "http://localhost:8080/v1")
                + "/litellm",
                model="anthropic/claude-haiku-4-5-20251001",
            )
            self._memori.enable()
            self._memori_enabled = True
            logger.info(f"🧠 Memori initialized for user {self.user_id}")
        except Exception as e:
            logger.error(f"❌ Memori initialization failed: {e}")
            self._memori = None
            self._memori_enabled = False

    async def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.FunctionTool],
        model_settings: ModelSettings,
    ) -> AsyncIterable[llm.ChatChunk]:
        """
        Custom LLM node using LiteLLM directly to enable Memori integration.
        Memori hooks intercept LiteLLM calls to provide context injection and storage.
        """
        # Convert to OpenAI format using LiveKit utilities
        messages, _ = chat_ctx.to_provider_format(format="openai")
        openai_tools = to_fnc_ctx(tools, strict=True) if tools else None

        base_url = os.getenv("BIFROST_URL", "http://localhost:8080/v1") + "/litellm"

        try:
            response = completion(
                model="openai/openrouter/openai/gpt-5-mini",
                messages=messages,
                api_key=self.bifrost_key,
                tool_choice="",
                base_url=base_url,
                tools=openai_tools,
                stream=True,
            )

            # Accumulate tool call data for streaming reconstruction
            tool_call_id = None
            fnc_name = None
            fnc_arguments = ""
            tool_index = None

            async for chunk in response:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                finish_reason = chunk.choices[0].finish_reason

                # Handle streaming tool calls (accumulate and emit on completion)
                if hasattr(delta, "tool_calls") and delta.tool_calls:
                    for tc in delta.tool_calls:
                        if not tc.function:
                            continue

                        # If new tool call starts, emit previous one first
                        if tool_call_id and tc.id and tc.index != tool_index:
                            yield llm.ChatChunk(
                                id=chunk.id,
                                delta=llm.ChoiceDelta(
                                    role="assistant",
                                    tool_calls=[
                                        llm.FunctionToolCall(
                                            arguments=fnc_arguments,
                                            name=fnc_name or "",
                                            call_id=tool_call_id,
                                        )
                                    ],
                                ),
                            )
                            tool_call_id = fnc_name = None
                            fnc_arguments = ""

                        if tc.function.name:
                            tool_index = tc.index
                            tool_call_id = tc.id
                            fnc_name = tc.function.name
                            fnc_arguments = tc.function.arguments or ""
                        elif tc.function.arguments:
                            fnc_arguments += tc.function.arguments

                # Emit final tool call on finish
                if finish_reason in ("tool_calls", "stop") and tool_call_id:
                    yield llm.ChatChunk(
                        id=chunk.id,
                        delta=llm.ChoiceDelta(
                            role="assistant",
                            tool_calls=[
                                llm.FunctionToolCall(
                                    arguments=fnc_arguments,
                                    name=fnc_name or "",
                                    call_id=tool_call_id,
                                )
                            ],
                        ),
                    )
                    tool_call_id = fnc_name = None
                    fnc_arguments = ""

                # Handle text content
                if delta.content:
                    yield llm.ChatChunk(
                        id=chunk.id,
                        delta=llm.ChoiceDelta(content=delta.content, role="assistant"),
                    )

        except Exception as e:
            logger.error(f"❌ LLM Generation Error: {e}")

    # ... (Keep existing methods: connect_with_computer, on_user_turn_completed, etc.)
    async def connect_with_computer(self, session: AgentSession):
        async def agent_response_handler(response_text):
            logger.info(
                f"🤖 Received response from {self.agent_client.agent_name}: {response_text}"
            )
            speech_handle = await session.generate_reply(
                instructions=f"Update the user about the task: {response_text}",
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
            return
        recent_task_update = self.task_queue.get_nowait()
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
        if agent_type == "claude":
            ws_url = "ws://localhost:8003/ws"
        else:
            ws_url = "ws://localhost:8001/ws"
        self.agent_url = ws_url
        print(f"🤖 Setting up local assistant with {self.agent_client.agent_name}...")
        await self.agent_client.connect(ws_url, user_id=self.user_id)

    @function_tool()
    async def display_computer(self, context: RunContext) -> None:
        if self.room.remote_participants:
            participant_identity = next(iter(self.room.remote_participants))
        else:
            logger.warning("⚠️ No remote participants found, skipping VNC display")
            self.agent_url = self.heycomputer_sandbox["computer_agent_url"]
            self.log_url = self.heycomputer_sandbox.get("logs_url", "")
            await self._connect_agent(self.agent_url)

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

        await self._connect_agent(self.agent_url)

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

    async def _connect_agent(self, agent_url: str):
        await self.agent_client.connect(agent_url, user_id=self.user_id)
        await self.connect_with_computer(self._session)

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
            await self._connect_agent(self.agent_url)
            return f"Connected to your virtual computer instance via {self.agent_client.agent_name}."
        except Exception as e:
            logger.error(f"❌ Exception in connect_computer: {e}")
            return f"Error connecting to virtual computer: {str(e)}"

    @function_tool()
    async def computer_use(self, context: RunContext, task_description: str) -> str:
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


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"🚀 Agent entrypoint called - Room: {ctx.room.name}")
    logger.info(f"📦 Job metadata: {ctx.job.metadata}")
    job_metadata = parse_job_metadata(ctx.job.metadata)
    user_id = job_metadata["user_id"]

    room = ctx.room
    logger.info("📝 Generating persona-enhanced system prompt...")
    instructions = await get_computer_persona(user_id)

    logger.debug("Fetching virtual key for inference")
    bifrost_key = await get_user_virtual_key(user_id)

    # Check if local memory proxy is running, else use bifrost directly
    # openai_base_url = os.getenv("MEMORY_OPENAI_URL", "http://localhost:8081/v1")

    # We use direct OpenAI URL (Bifrost) because we handle memory injection in llm_node
    openai_base_url = os.getenv("BIFROST_URL", "http://localhost:8080/v1")

    session = AgentSession(
        stt=deepgram.STTv2(
            model="flux-general-en",
            eager_eot_threshold=0.4,
        ),
        llm=openai.LLM(
            base_url=openai_base_url + "/v1",
            model="groq/openai/gpt-oss-safeguard-20b",
            api_key=bifrost_key,
        ),
        tts=cartesia.TTS(
            voice="6ccbfb76-1fc6-48f7-b71d-91ac6298247b", model="sonic-3", language="en"
        ),
    )

    heycomputer_agent = Assistant(
        user_id=user_id,
        room=room,
        session=session,
        instructions=instructions,
        bifrost_key=bifrost_key,
    )

    logger.info(f"👤 Remote participants: {list(ctx.room.remote_participants)}")

    # Fire-and-forget: launch computer in background to speed up session start
    async def setup_computer():
        try:
            await heycomputer_agent.launch_computer()
            await heycomputer_agent.connect_with_computer(session)
            logger.info("✅ Computer setup complete")
        except Exception as e:
            logger.error(f"❌ Computer setup failed: {e}")

    asyncio.create_task(setup_computer())

    await session.start(
        room=ctx.room,
        agent=heycomputer_agent,
    )


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
