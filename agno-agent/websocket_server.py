import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from agent_main import ComputerAgent

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manage WebSocket connections and agent sessions."""

    def __init__(self):
        self.websocket: Optional[WebSocket] = None
        self.agent: Optional[ComputerAgent] = None
        self.connection_id: Optional[str] = None
        self.user_id: Optional[str] = None

    async def connect(self, websocket: WebSocket, user_id: str) -> str:
        """Accept a WebSocket connection and create agent."""
        await websocket.accept()

        self.websocket = websocket
        self.user_id = user_id
        self.connection_id = str(uuid.uuid4())
        connection_id = self.connection_id

        try:
            agent = ComputerAgent(user_id=user_id)
            await agent.initialize()
            self.agent = agent
            agent.set_message_sender(self.send_message)

            logger.info(f"Client connected: {user_id} ({connection_id})")

            await websocket.send_text(
                json.dumps(
                    {
                        "type": "connected",
                        "connection_id": connection_id,
                    }
                )
            )

            return connection_id
        except Exception as e:
            logger.error(f"Failed to initialize agent for {user_id}: {e}")
            await websocket.close(code=1011, reason="Agent initialization failed")
            raise

    def disconnect(self, connection_id: str, user_id: str):
        """Disconnect a client and clean up resources."""
        if self.agent:
            asyncio.create_task(self.agent.cleanup())

        self.agent = None
        self.websocket = None
        self.connection_id = None
        self.user_id = None

        logger.info(f"Client disconnected: {user_id} ({connection_id})")

    async def handle_message(self, connection_id: str, user_id: str, message: dict):
        """Handle incoming message from client."""
        if not self.agent or not self.websocket:
            logger.error(f"No agent found for connection {connection_id}")
            return

        agent = self.agent
        websocket = self.websocket

        if message.get("type") == "message":
            task = message.get("content", "")
            session_id = message.get("session_id")
            if not session_id:
                logger.error("Session ID missing in message; cannot process task")
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": "Session ID is required",
                            "user_id": user_id,
                        }
                    )
                )
                return

            try:
                await agent.run_task_stream(task, session_id)

            except Exception as e:
                logger.error(f"Error processing task: {e}", exc_info=True)
                try:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "message": str(e),
                                "user_id": user_id,
                                "session_id": session_id,
                            }
                        )
                    )
                except Exception as send_error:
                    logger.error(f"Failed to send error message: {send_error}")

    async def send_message(self, message):
        """Send message to the connected client."""
        if (
            not self.websocket
            or self.websocket.client_state != WebSocketState.CONNECTED
        ):
            logger.error("No active websocket to send message")
            return

        payload = json.dumps(message) if isinstance(message, dict) else str(message)
        logger.debug("sending", payload)
        await self.websocket.send_text(payload)

    def connection_count(self) -> int:
        return 1 if self.websocket else 0
