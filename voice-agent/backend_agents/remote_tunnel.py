"""
RemoteTunnel - Pub/Sub tunnel for remote agent communication.

Connects to a relay server and provides:
- pub(): Publish messages to the tunnel
- sub(): Subscribe to incoming messages with a callback
"""

import asyncio
import json
import logging
import os
from typing import Callable, Optional

import websockets

from backend_agents.tunnel_interface import TunnelInterface

logger = logging.getLogger(__name__)

class RemoteTunnel(TunnelInterface):
    """Pub/Sub tunnel for remote agent communication."""

    def __init__(self, host: str = None, api_key: str = None):
        super().__init__()
        self.websocket = None
        self.agent_id = "voice-agent"
        self.host = host or os.getenv("PARTYKIT_HOST")
        self.api_key = api_key

    async def connect_to_room(
        self, room_id: str, agent_id: str = "voice-agent", role: str = "voice-agent", **kwargs
    ) -> None:
        """
        Connect to a room by room ID (convenience method).
        Handles URL formation internally.
        """
        protocol = "ws" if "localhost" in self.host else "wss"
        url = f"{protocol}://{self.host}/parties/main/{room_id}"
        return await self.connect(url, agent_id=agent_id, role=role, **kwargs)

    async def connect(
        self, url: str, agent_id: str = "voice-agent", role: str = "voice", **kwargs
    ) -> None:
        """Connect to the relay tunnel."""
        try:
            self.agent_id = agent_id
            separator = "&" if "?" in url else "?"
            api_key_param = f"&apiKey={self.api_key}" if self.api_key else ""
            full_url = f"{url}{separator}id={self.agent_id}&role={role}{api_key_param}"

            self.websocket = await websockets.connect(full_url)
            self._is_connected = True
            asyncio.create_task(self._listen())
            logger.info("✅ Connected to tunnel")
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self._is_connected = False
            raise

    def sub(self, callback: Callable) -> None:
        """Subscribe to incoming messages with a callback."""
        self._callback = callback

    async def pub(self, message: str, agent: str = "opencode", **kwargs) -> bool:
        """
        Publish a task message to the tunnel.

        Args:
            message: The task content/description
            agent: Target agent (default: "opencode")
            **kwargs: Additional args
        """
        if not self.websocket or not self._is_connected:
            logger.error("Cannot publish: Not connected")
            return False

        payload = {
            "type": "tasks",
            "content": message,
            "agent": agent,
            "source": self.agent_id,
        }

        try:
            await self.websocket.send(json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Failed to publish: {e}")
            return False

    async def publish(self, payload: dict) -> bool:
        """Publish a raw payload to the tunnel."""
        if not self.websocket or not self._is_connected:
            logger.error("Cannot publish: Not connected")
            return False

        try:
            await self.websocket.send(json.dumps(payload))
            return True
        except Exception as e:
            logger.error(f"Failed to publish: {e}")
            return False

    # Legacy alias
    async def send_message(self, message: str, agent: str = "opencode", **kwargs) -> bool:
        return await self.pub(message, agent=agent, **kwargs)

    async def _listen(self):
        """Listen for incoming messages and invoke subscriber callback."""
        try:
            while self._is_connected and self.websocket:
                message = await self.websocket.recv()
                await self._handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.error(f"Tunnel error: {e}")
        finally:
            self._is_connected = False

    async def _handle_message(self, message: str):
        """Handle incoming messages and invoke subscriber callback."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            logger.debug(f"📨 Received message type: {msg_type}")

            content = None
            if msg_type == "task-response":
                content = data.get("result") or data.get("error", "")
            elif msg_type == "task-update":
                status = data.get("status", "running")
                if status in ("needs_input", "completed", "error"):
                    content = data.get("message", "")
            elif msg_type == "response":
                content = data.get("content", "")
            elif msg_type == "tasks":
                # Ignore task messages (we're the sender)
                logger.debug("Ignoring tasks message (echo)")
                return

            if content and self._callback:
                if asyncio.iscoroutinefunction(self._callback):
                    await self._callback(content)
                else:
                    self._callback(content)

        except json.JSONDecodeError:
            pass
        except Exception as e:
            logger.error(f"Message error: {e}")

    async def disconnect(self) -> None:
        """Disconnect from the tunnel."""
        self._is_connected = False
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
            self.websocket = None
