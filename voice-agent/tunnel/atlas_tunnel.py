"""
AtlasTunnel - WebSocket connection to Atlas (Cloudflare Agent)

Receives task updates from Atlas agent via WebSocket.
"""

import asyncio
import json
import logging
from typing import Callable, Optional

import websockets
from websockets.client import WebSocketClientProtocol

logger = logging.getLogger(__name__)


class AtlasTunnel:
    """WebSocket tunnel to Atlas agent for receiving task updates."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self._ws: Optional[WebSocketClientProtocol] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._callback: Optional[Callable] = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected and self._ws is not None

    async def connect(self, user_id: str):
        """Connect to Atlas agent WebSocket with header-based auth."""
        ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{ws_url}/agents/atlas-agent/{user_id}"

        # Use header-based auth for voice agent (server-to-server)
        headers = {}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key
            headers["X-Agent-Role"] = "voice"

        logger.info(f"[Tunnel] Connecting to {url}")
        self._ws = await websockets.connect(url, additional_headers=headers)
        self._connected = True
        self._listen_task = asyncio.create_task(self._listen())
        logger.info("[Tunnel] Connected to Atlas agent")

    async def disconnect(self):
        """Disconnect from Atlas agent."""
        self._connected = False
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()
        logger.info("[Tunnel] Disconnected")

    def on_message(self, callback: Callable):
        """Register callback for incoming task-update messages."""
        self._callback = callback

    async def _listen(self):
        """Listen for messages from Atlas agent."""
        if not self._ws:
            return
        try:
            async for raw in self._ws:
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type", "")
                    content = data.get("content", "")

                    if msg_type == "task-update" and self._callback and content:
                        if asyncio.iscoroutinefunction(self._callback):
                            await self._callback(content)
                        else:
                            self._callback(content)
                    elif msg_type == "connected":
                        logger.info(f"[Tunnel] Agent confirmed: {data}")

                except json.JSONDecodeError:
                    pass
        except websockets.ConnectionClosed:
            logger.info("[Tunnel] Connection closed")
            self._connected = False
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[Tunnel] Listen error: {e}")
            self._connected = False
