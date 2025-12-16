"""
RemoteTunnel - Pub/Sub tunnel for remote agent communication.

Connects to a relay server and provides:
- pub(): Publish messages to the tunnel
- sub(): Subscribe to incoming messages with a callback
"""

import asyncio
import json
import logging
from typing import Callable, Optional

import websockets

from backend_agents.tunnel_interface import TunnelInterface

logger = logging.getLogger(__name__)

DEFAULT_HOST = "heycomputer-agents-rooms.bishwenduk029.partykit.dev"


class RemoteTunnel(TunnelInterface):
    """Pub/Sub tunnel for remote agent communication."""

    def __init__(self, host: str = None):
        super().__init__()
        self.websocket = None
        self.agent_id = "voice-agent"
        self.host = host or DEFAULT_HOST

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
        self, url: str, agent_id: str = "voice-agent", role: str = "voice-agent", **kwargs
    ) -> None:
        """Connect to the relay tunnel."""
        try:
            self.agent_id = agent_id
            separator = "&" if "?" in url else "?"
            full_url = f"{url}{separator}id={self.agent_id}&role={role}"

            logger.info(f"🔌 Connecting to tunnel at {full_url}")
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
        logger.info("✅ Subscribed to tunnel messages")

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
            logger.info(f"📤 Published to {agent}: {message[:50]}...")
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
            logger.warning("📴 Tunnel connection closed")
        except Exception as e:
            logger.error(f"Error in listener: {e}")
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
                # Response from CLI agent with result
                content = data.get("result") or data.get("error", "")
                logger.info(f"📥 Task response received ({len(content)} chars): {content[:100]}...")
            elif msg_type == "task-update":
                status = data.get("status", "running")
                if status in ("needs_input", "completed", "error"):
                    content = data.get("message", "")
                    logger.info(f"Task {status}: {content[:50]}...")
            elif msg_type == "response":
                content = data.get("content", "")
            elif msg_type == "tasks":
                # Ignore task messages (we're the sender)
                logger.debug("Ignoring tasks message (echo)")
                return

            if content and self._callback:
                logger.info(f"🔔 Invoking callback with content")
                if asyncio.iscoroutinefunction(self._callback):
                    await self._callback(content)
                else:
                    self._callback(content)
            elif content:
                logger.warning(f"⚠️ No callback registered to handle content")
            else:
                logger.debug(f"No content to process for message type: {msg_type}")

        except json.JSONDecodeError:
            logger.warning(f"Received non-JSON message: {message}")
        except Exception as e:
            logger.error(f"Error handling message: {e}", exc_info=True)

    async def disconnect(self) -> None:
        """Disconnect from the tunnel."""
        self._is_connected = False
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
            self.websocket = None
        logger.info("📴 Disconnected from tunnel")
