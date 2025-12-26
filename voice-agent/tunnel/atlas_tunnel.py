"""
AtlasTunnel - WebSocket connection to Atlas (Cloudflare Agent)

Receives voice_update messages from Atlas agent when CLI completions occur.
"""

import asyncio
import json
import logging
from typing import Callable, Optional

import websockets
from websockets.client import WebSocketClientProtocol
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)


class AtlasTunnel:
    """WebSocket tunnel to Atlas agent for receiving voice updates."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self._ws: Optional[WebSocketClientProtocol] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._callback: Optional[Callable] = None

    @property
    def is_connected(self) -> bool:
        return self._ws is not None and self._ws.open

    async def connect(self, user_id: str):
        """Connect to Atlas agent WebSocket with header-based auth."""
        ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{ws_url}/agents/atlas-agent/{user_id}"

        headers = {}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key
            headers["X-Agent-Role"] = "voice"

        logger.info(f"[Tunnel] Connecting to {url}")
        self._ws = await websockets.connect(url, additional_headers=headers)
        self._listen_task = asyncio.create_task(self._listen())
        logger.info("[Tunnel] Connected to Atlas agent")

    async def disconnect(self):
        """Disconnect from Atlas agent."""
        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass

        if self._ws:
            await self._ws.close()
            self._ws = None

        logger.info("[Tunnel] Disconnected")

    def on_message(self, callback: Callable):
        """Register callback for incoming task-update messages."""
        self._callback = callback

    async def _listen(self):
        """Listen for messages from Atlas agent."""
        try:
            async for message in self._ws:
                await self._handle_message(message)
        except ConnectionClosed as e:
            logger.info(f"[Tunnel] Connection closed: code={e.code}, reason={e.reason}")
        except asyncio.CancelledError:
            logger.debug("[Tunnel] Listen task cancelled")
            raise
        except Exception as e:
            logger.error(f"[Tunnel] Listen error: {e}", exc_info=True)

    async def _handle_message(self, raw_message: str):
        """Handle incoming voice update messages from Atlas."""
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError as e:
            logger.warning(f"[Tunnel] Invalid JSON: {e}")
            return

        msg_type = data.get("type")

        if msg_type == "voice_update":
            # Handle voice update from CLI completion events
            summary = data.get("summary", "")
            if summary:
                logger.info(f"[Tunnel] Voice update: {summary[:50]}...")
                await self._invoke_callback(summary)

    async def _invoke_callback(self, summary: str):
        """Invoke the registered callback with the task summary."""
        if not self._callback:
            return

        if asyncio.iscoroutinefunction(self._callback):
            await self._callback(summary)
        else:
            self._callback(summary)
