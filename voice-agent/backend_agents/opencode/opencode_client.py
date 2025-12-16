"""
OpenCode client using WebSocket for communication.
Same pattern as Goose/Agno agents.
"""

import asyncio
import json
import logging

import websockets
from websockets.exceptions import ConnectionClosed

from ..tunnel_interface import TunnelInterface

logger = logging.getLogger(__name__)


class OpenCodeClient(TunnelInterface):
    """WebSocket client for OpenCode agent communication."""

    def __init__(self):
        super().__init__()
        self.websocket = None

    async def connect(self, uri: str, user_id: str = "anonymous", **kwargs) -> bool:
        """Connect to OpenCode bridge WebSocket server."""
        try:
            if "?" in uri:
                ws_uri = f"{uri}&user_id={user_id}"
            else:
                ws_uri = f"{uri}?user_id={user_id}"

            logger.info(f"🔌 Connecting to OpenCode bridge at {ws_uri}")
            self.websocket = await websockets.connect(ws_uri)
            self._is_connected = True
            logger.info("✅ Connected to OpenCode bridge")

            asyncio.create_task(self._receive_messages())
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to OpenCode bridge: {e}")
            return False

    async def send_message(
        self, message: str, session_id: str = None, **kwargs
    ) -> bool:
        """Send a task to OpenCode."""
        if not self.is_connected or not self.websocket:
            logger.error("❌ Not connected to OpenCode bridge")
            return False

        try:
            payload = {"type": "message", "content": message}
            if session_id:
                payload["session_id"] = session_id

            await self.websocket.send(json.dumps(payload))
            logger.info(f"📤 Sent task: {message[:50]}...")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to send message: {e}")
            self._is_connected = False
            return False

    async def _receive_messages(self):
        """Receive and forward messages from the bridge."""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    if data.get("type") == "response" and self._callback:
                        content = data.get("content", "")
                        logger.info(f"📥 Response: {content[:100]}...")
                        await self._callback(content)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON: {message}")
        except ConnectionClosed:
            logger.info("📴 WebSocket connection closed")
        except Exception as e:
            logger.error(f"❌ Error receiving messages: {e}")
        finally:
            self._is_connected = False
            if self.websocket:
                try:
                    await self.websocket.close()
                except Exception:
                    pass

    async def disconnect(self) -> None:
        """Disconnect from the bridge."""
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
        self._is_connected = False
        logger.info("📴 Disconnected from OpenCode bridge")

    @property
    def agent_name(self) -> str:
        return "OpenCode"
