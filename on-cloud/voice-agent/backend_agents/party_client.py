import asyncio
import json
import logging
from typing import Any, Callable, Coroutine, Dict, Optional

import websockets

from backend_agents.agent_interface import BaseAgentClient

logger = logging.getLogger(__name__)


class PartyClient(BaseAgentClient):
    def __init__(self):
        super().__init__()
        self.websocket = None
        self.agent_id = "voice-agent"

    async def connect(self, url: str, agent_id: str = "voice-agent", **kwargs) -> None:
        """Connect to the PartyKit server."""
        try:
            self.agent_id = agent_id
            # Append agent_id to query params
            # Ensure url handles existing query params if any
            separator = "&" if "?" in url else "?"
            full_url = f"{url}{separator}id={self.agent_id}&role=voice-agent"

            logger.info(f"Connecting to PartyKit relay at {full_url}")
            self.websocket = await websockets.connect(full_url)
            self._is_connected = True

            asyncio.create_task(self._listen())
            logger.info("Connected to PartyKit relay")
        except Exception as e:
            logger.error(f"Failed to connect to PartyKit: {e}")
            self._is_connected = False
            raise

    async def send_message(
        self, message: str, agent: str = "opencode", **kwargs
    ) -> bool:
        """
        Send a task to the PartyKit relay.

        Args:
            message: The task content/description
            agent: Target agent (default: "opencode")
            **kwargs: Additional args
        """
        if not self.websocket or not self._is_connected:
            logger.error("Cannot send task: Not connected")
            return False

        payload = {
            "type": "tasks",
            "content": message,
            "agent": agent,
            "source": self.agent_id,
        }

        try:
            await self.websocket.send(json.dumps(payload))
            logger.info(f"Sent task to {agent}: {message[:50]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to send task: {e}")
            return False

    async def _listen(self):
        """Listen for incoming messages."""
        try:
            while self._is_connected and self.websocket:
                message = await self.websocket.recv()
                await self._handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            logger.warning("PartyKit connection closed")
        except Exception as e:
            logger.error(f"Error in PartyKit listener: {e}")
        finally:
            self._is_connected = False

    async def _handle_message(self, message: str):
        """Handle incoming JSON messages."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")

            # Extract content based on message type
            content = None
            if msg_type == "task-update":
                status = data.get("status", "running")
                # Only forward important updates to voice
                if status in ("needs_input", "completed", "error"):
                    content = data.get("message", "")
                    logger.info(f"Task {status}: {content[:50]}...")
            elif msg_type == "response":
                content = data.get("content", "")

            # Call the response callback if we have content
            if content and self._callback:
                if asyncio.iscoroutinefunction(self._callback):
                    await self._callback(content)
                else:
                    self._callback(content)

        except json.JSONDecodeError:
            logger.warning(f"Received non-JSON message: {message}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")

    async def disconnect(self) -> None:
        """Close the connection."""
        self._is_connected = False
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
            self.websocket = None
