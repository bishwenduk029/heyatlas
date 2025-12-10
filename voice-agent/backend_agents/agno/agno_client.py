import asyncio
import json
import logging
from typing import Callable, Optional

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException
from ..agent_interface import BaseAgentClient

logger = logging.getLogger(__name__)


class AgnoClient(BaseAgentClient):
    """WebSocket client for Agno agent communication."""

    def __init__(self):
        super().__init__()  # Initialize base class
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.response_callback: Optional[Callable] = None

    def set_callback(self, callback: Callable[[str], None]) -> None:
        """Set the callback function for handling agent responses."""
        self.response_callback = callback

    async def connect(self, uri: str, user_id: str = "anonymous", **kwargs) -> bool:
        """Connect to Agno agent WebSocket server."""
        try:
            # Add user_id to query parameters
            if "?" in uri:
                ws_uri = f"{uri}&user_id={user_id}"
            else:
                ws_uri = f"{uri}?user_id={user_id}"

            logger.info(f"Connecting to Agno agent at {ws_uri}")
            self.websocket = await websockets.connect(ws_uri)
            self._is_connected = True
            logger.info("Connected to Agno agent")

            asyncio.create_task(self._receive_messages())
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Agno agent: {e}")
            return False

    async def send_message(
        self, message: str, session_id: str = None, **kwargs
    ) -> bool:
        """Send a message to the Agno agent."""
        if not self.is_connected or not self.websocket:
            logger.error("Not connected to Agno agent")
            return False

        try:
            payload = {"type": "message", "content": message}
            if session_id:
                payload["session_id"] = session_id

            await self.websocket.send(json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            self._is_connected = False
            return False

    async def _receive_messages(self):
        """Receive and forward messages from the agent."""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    if data.get("type") == "response" and self.response_callback:
                        content = data.get("content", "")
                        await self.response_callback(content)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON received: {message}")
        except ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"Error receiving messages: {e}")
        finally:
            self._is_connected = False

    async def disconnect(self):
        """Disconnect from the agent."""
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
        self.is_connected = False
        logger.info("Disconnected from Agno agent")
