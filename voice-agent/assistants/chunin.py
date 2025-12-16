"""
ChuninAssistant - Atlas with Memory & Web Search (Tier 2)

Chunin - Intermediate Ninja Rank:
- Inherits basic task delegation from Genin
- Adds memory capabilities (mem0)
- MCP servers support (configured in entrypoint)
- Memory tools: save, search
- Maps to: Pro pricing plan
"""

import asyncio
import json
import logging
import os

from livekit.agents import AgentSession, FunctionToolsExecutedEvent, RunContext, function_tool, mcp
from livekit.plugins import deepgram, openai
from mem0 import MemoryClient

from .genin import GeninAssistant
from .context import AssistantContext
from .registry import register_assistant

logger = logging.getLogger(__name__)


@register_assistant("chunin")
class ChuninAssistant(GeninAssistant):
    """
    Tier 2: Atlas with Memory & Web Search
    - Inherits basic task delegation from Genin
    - Adds memory capabilities
    - MCP servers enabled (UI + web search)
    """

    def __init__(self, ctx: AssistantContext) -> None:
        # Initialize memory and persona
        from utils.user import initialize_memory, generate_persona
        from utils.instructions import build_chunin_jonin_instructions

        try:
            user_id = ctx.user_id  # Fix: use ctx.user_id instead of undefined user_id
            self.memory = initialize_memory(user_id, ctx.bifrost_key)
            user_persona = generate_persona(self.memory, user_id)
            logger.info(f"✅ Memory initialized for user: {user_id}")
        except Exception as e:
            logger.warning(f"⚠️ Memory initialization failed: {e}")
            self.memory = None
            user_persona = ""

        # Build instructions with persona
        instructions = build_chunin_jonin_instructions(user_persona=user_persona)

        # Call parent init (which creates basic session)
        super().__init__(ctx)

        # Override parent's instructions
        self.instructions = instructions

        # Recreate session with MCP servers
        logger.info(f"🎯 Creating Chunin session for user: {ctx.user_id}")
        logger.info(f"✅ Memory enabled for Chunin tier")
        logger.info(f"✅ MCP servers enabled for Chunin tier")

        # Configure MCP servers
        mcp_ui_server = os.getenv("MCP_UI_SERVER_URL")
        heyatlas_api_key = os.getenv("HEYATLAS_API_KEY", "dev-key-12345")

        parallels_web_search_mcp_server = os.getenv("PARALLELS_WEB_SEARCH_API")
        parallels_web_search_api_key = os.getenv(
            "PARALLELS_WEB_SEARCH_API_KEY", "dev-key-12345"
        )

        mcp_servers_list = [
            mcp.MCPServerHTTP(
                mcp_ui_server,
                headers={
                    "HEYATLAS_API_KEY": heyatlas_api_key,
                    "X-User-ID": ctx.user_id,
                },
            ),
            mcp.MCPServerHTTP(
                parallels_web_search_mcp_server,
                headers={"Authorization": f"Bearer {parallels_web_search_api_key}"},
            ),
        ]

        self.session = AgentSession(
            stt=deepgram.STTv2(
                model="flux-general-en",
                eager_eot_threshold=0.4,
            ),
            llm=openai.LLM(
                base_url=os.getenv("BIFROST_URL") + "/v1",
                model=os.getenv("VOICE_AGENT_LLM"),
                api_key=self.bifrost_key,  # Already set with fallback in parent
            ),
            tts=openai.TTS(
                base_url=os.getenv("VOICE_AGENT_TTS_PROVIDER"),
                model=os.getenv("VOICE_AGENT_TTS"),
                voice="tara",
                speed="1.0",
                api_key=os.getenv("VOICE_AGENT_TTS_PROVIDER_KEY"),
            ),
            mcp_servers=mcp_servers_list,
        )

        # Update reference
        self._session = self.session

        # Register MCP UI event handler
        self._register_mcp_ui_handler()

    def _register_mcp_ui_handler(self):
        """Register event handler to forward MCP UI resources to frontend."""

        @self.session.on("function_tools_executed")
        def on_function_tools_executed(event: FunctionToolsExecutedEvent):
            """Detect MCP UI tool calls and forward UIResource to frontend via RPC"""

            async def forward_ui_resource(resource: dict, tool_name: str, arguments: dict):
                """Async helper to forward UIResource via RPC"""
                if self.room.remote_participants:
                    participant_identity = next(iter(self.room.remote_participants))

                    ui_payload = {
                        "type": "ui_resource",
                        "resource": resource,
                        "toolName": tool_name,
                        "arguments": arguments,
                    }

                    try:
                        await self.room.local_participant.perform_rpc(
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

                    # Parse the output (it's a JSON string)
                    try:
                        result = json.loads(output.output)

                        # MCP UI returns resource directly, not in content array
                        if result.get("type") == "resource" and "resource" in result:
                            resource = result.get("resource", {})

                            # Check if it's a UI resource (mimeType: text/html)
                            if resource.get("mimeType") == "text/html":
                                logger.info(f"✨ Found UIResource in tool response")

                                # Forward to frontend via RPC (non-blocking)
                                asyncio.create_task(
                                    forward_ui_resource(resource, call.name, call.arguments)
                                )
                    except (json.JSONDecodeError, AttributeError) as e:
                        logger.error(f"❌ Failed to parse tool output: {e}")

        logger.info("✅ MCP UI event handler registered")

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
        """Store user information or conversation context in memory (silent)."""
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
