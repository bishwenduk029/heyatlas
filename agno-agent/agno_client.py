import json
import logging
import asyncio
from typing import Optional, Callable, Dict, Any
from enum import Enum
from dataclasses import dataclass, asdict
import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """Enum for task execution statuses."""
    RUNNING = "running"
    COMPLETED = "completed"
    NEEDS_INPUT = "needs_input"
    ERROR = "error"


@dataclass
class TaskUpdate:
    """Data structure for task status updates."""
    status: str  # TaskStatus enum value
    progress: int  # 0-100
    message: str  # Current status message
    task_id: Optional[str] = None
    estimated_time_remaining: Optional[int] = None  # in seconds
    required_input: Optional[Dict[str, Any]] = None  # when needs_input
    error_details: Optional[str] = None  # when error


class AgnoClient:
    """WebSocket client for Agno agent communication."""

    def __init__(self):
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.response_callback: Optional[Callable] = None
        self.task_update_callback: Optional[Callable[[TaskUpdate], None]] = None
        self.is_connected = False

    def set_callback(self, callback: Callable[[str], None]) -> None:
        """Set the callback function for handling agent responses."""
        self.response_callback = callback

    def set_task_update_callback(self, callback: Callable[[TaskUpdate], None]) -> None:
        """Set the callback function for handling task status updates."""
        self.task_update_callback = callback

    async def connect(self, uri: str, user_id: str = "anonymous") -> bool:
        """Connect to Agno agent WebSocket server."""
        try:
            # Add user_id to query parameters
            if "?" in uri:
                ws_uri = f"{uri}&user_id={user_id}"
            else:
                ws_uri = f"{uri}?user_id={user_id}"
            
            logger.info(f"Connecting to Agno agent at {ws_uri}")
            self.websocket = await websockets.connect(ws_uri)
            self.is_connected = True
            logger.info("Connected to Agno agent")
            
            # Start receiving messages
            asyncio.create_task(self._receive_messages())
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Agno agent: {e}")
            return False

    async def send_message(self, message: str) -> bool:
        """Send a message to the Agno agent."""
        if not self.is_connected or not self.websocket:
            logger.error("Not connected to Agno agent")
            return False

        try:
            payload = {
                "type": "message",
                "content": message
            }
            await self.websocket.send(json.dumps(payload))
            logger.info(f"Sent message to Agno: {message[:100]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            self.is_connected = False
            return False

    async def send_task_update(self, task_update: TaskUpdate) -> bool:
        """Send a task status update to the agent/client."""
        if not self.is_connected or not self.websocket:
            logger.error("Not connected to Agno agent")
            return False

        try:
            payload = {
                "type": "task_update",
                "status": task_update.status,
                "progress": task_update.progress,
                "message": task_update.message,
                "task_id": task_update.task_id,
                "estimated_time_remaining": task_update.estimated_time_remaining,
            }
            
            if task_update.required_input:
                payload["required_input"] = task_update.required_input
            
            if task_update.error_details:
                payload["error_details"] = task_update.error_details
            
            await self.websocket.send(json.dumps(payload))
            logger.info(
                f"Sent task update - Status: {task_update.status}, "
                f"Progress: {task_update.progress}%, Message: {task_update.message[:50]}..."
            )
            return True
        except Exception as e:
            logger.error(f"Failed to send task update: {e}")
            self.is_connected = False
            return False

    async def _receive_messages(self):
        """Receive and forward messages from the agent."""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    
                    if msg_type == "response" and self.response_callback:
                        content = data.get("content", "")
                        await self.response_callback(content)
                    
                    elif msg_type == "task_update" and self.task_update_callback:
                        task_update = TaskUpdate(
                            status=data.get("status"),
                            progress=data.get("progress", 0),
                            message=data.get("message", ""),
                            task_id=data.get("task_id"),
                            estimated_time_remaining=data.get("estimated_time_remaining"),
                            required_input=data.get("required_input"),
                            error_details=data.get("error_details")
                        )
                        await self.task_update_callback(task_update)
                    
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON received: {message}")
        except ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"Error receiving messages: {e}")
        finally:
            self.is_connected = False

    async def disconnect(self):
        """Disconnect from the agent."""
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
        self.is_connected = False
        logger.info("Disconnected from Agno agent")
