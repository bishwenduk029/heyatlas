from __future__ import annotations

import logging
import json
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from livekit.agents._exceptions import APIConnectionError, APIStatusError
from livekit.agents.llm import LLM, LLMStream
from livekit.agents.llm.chat_context import AudioContent, ChatContext, ChatMessage
from livekit.agents.llm.llm import ChatChunk, ChoiceDelta
from livekit.agents.llm.tool_context import FunctionTool, RawFunctionTool
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

logger = logging.getLogger(__name__)


@dataclass
class _VoltAgentLLMOptions:
    base_url: str
    agent_id: str
    auth_token: str | None


class VoltAgentLLM(LLM[None]):
    """LiveKit LLM adapter that streams *text-delta* from VoltAgent.

    VoltAgent may emit tool-call/tool-result events; we ignore them and only
    forward assistant text for TTS.
    """

    def __init__(
        self,
        *,
        base_url: str,
        agent_id: str,
        auth_token: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__()
        self._opts = _VoltAgentLLMOptions(
            base_url=base_url.rstrip("/"),
            agent_id=agent_id,
            auth_token=auth_token,
        )
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(connect=15.0, read=60.0, write=15.0, pool=15.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )

    @property
    def model(self) -> str:
        return self._opts.agent_id

    @property
    def provider(self) -> str:
        return self._opts.base_url

    async def aclose(self) -> None:
        await self._client.aclose()

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[FunctionTool | RawFunctionTool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls=None,
        tool_choice=None,
        extra_kwargs=None,
    ) -> LLMStream:
        # Even though we don't expose tool-calling to VoltAgent, LiveKit's base
        # LLMStream requires a tools list for tracing/metrics.
        return _VoltAgentLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )


class _VoltAgentLLMStream(LLMStream):
    async def _run(self) -> None:
        request_id = f"volt_{uuid.uuid4().hex}"

        url = f"{self._llm._opts.base_url}/agents/{self._llm._opts.agent_id}/stream"
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        if self._llm._opts.auth_token:
            headers["Authorization"] = f"Bearer {self._llm._opts.auth_token}"

        def _message_text(msg: ChatMessage) -> str | None:
            parts: list[str] = []
            for c in msg.content:
                if isinstance(c, str):
                    parts.append(c)
                elif isinstance(c, AudioContent) and c.transcript:
                    parts.append(c.transcript)
            joined = "\n".join([p for p in parts if p])
            return joined or None

        messages: list[dict[str, Any]] = []
        for item in self._chat_ctx.items:
            if not isinstance(item, ChatMessage):
                continue

            text = _message_text(item)
            if not text:
                continue

            role = item.role
            if role == "developer":
                role = "system"

            messages.append({"role": role, "content": text})

        payload = {"input": messages, "options": {}}

        logger.info("VoltAgentLLM: POST %s (%d msgs)", url, len(messages))
        saw_text = False

        try:
            async with self._llm._client.stream(
                "POST",
                url,
                headers=headers,
                json=payload,
                timeout=httpx.Timeout(self._conn_options.timeout),
            ) as resp:
                if resp.status_code >= 400:
                    body_text = await resp.aread()
                    raise APIStatusError(
                        f"VoltAgent error {resp.status_code}",
                        status_code=resp.status_code,
                        body=body_text.decode("utf-8", errors="replace"),
                    )

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue

                    # Support both "data: {...}" and "data:{...}".
                    data = line[5:].lstrip().strip()
                    if not data:
                        continue

                    # Some SSE implementations send a terminal marker.
                    if data == "[DONE]":
                        return

                    try:
                        evt = json.loads(data)
                    except Exception:
                        continue

                    if not isinstance(evt, dict):
                        continue

                    evt_type = evt.get("type")
                    if evt_type == "text-delta":
                        # VoltAgent emits `text` for text-delta payloads.
                        # Keep a few aliases in case the upstream format changes.
                        delta_text = evt.get("text") or evt.get("delta") or evt.get("textDelta")
                        if not delta_text:
                            continue

                        if not saw_text:
                            saw_text = True
                            logger.info("VoltAgentLLM: first text received")

                        self._event_ch.send_nowait(
                            ChatChunk(
                                id=request_id,
                                delta=ChoiceDelta(role="assistant", content=str(delta_text)),
                            )
                        )
                        continue

                    # IMPORTANT: only treat `finish` as terminal.
                    # VoltAgent often sends `finish-step` before `finish`; if we close the HTTP
                    # stream early we trigger server-side "Controller already closed" errors.
                    if evt_type == "finish":
                        logger.info("VoltAgentLLM: finished")
                        return

        except httpx.TimeoutException as e:
            raise APIConnectionError("VoltAgent request timed out", retryable=True) from e
        except httpx.HTTPError as e:
            raise APIConnectionError("VoltAgent connection error", retryable=True) from e
