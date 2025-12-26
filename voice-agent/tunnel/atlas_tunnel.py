"""
AtlasTunnel - WebSocket connection to Atlas (Cloudflare Agent)

Receives state updates from Atlas agent via CF_AGENT_STATE sync.
Watches for tasks with state "pending-user-feedback" to trigger voice responses.
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
    """WebSocket tunnel to Atlas agent for receiving task updates."""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self._ws: Optional[WebSocketClientProtocol] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._callback: Optional[Callable] = None
        self._initialized = False  # Skip initial state sync
        self._task_states: dict[str, str] = {}  # task_id -> state

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
        """Handle a single incoming message."""
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError as e:
            logger.warning(f"[Tunnel] Invalid JSON: {e}")
            return

        msg_type = data.get("type")
        content = data.get("content")

        if msg_type == "connected":
            logger.info(f"[Tunnel] Agent confirmed connection: {content}")
        elif msg_type == "cf_agent_state":
            # Handle state sync from Atlas
            await self._handle_state_update(data.get("state", {}))
        elif msg_type == "cf_agent_chat_messages":
            logger.debug(f"[Tunnel] Chat message: {content}")
        elif msg_type == "voice_update":
            # Handle voice update from CLI completion events
            summary = data.get("summary", "")
            if summary:
                logger.info(f"[Tunnel] Voice update: {summary[:50]}...")
                await self._invoke_callback(summary)

    async def _handle_state_update(self, state: dict):
        """Handle state updates from Atlas. Watch for pending-user-feedback tasks."""
        tasks = state.get("tasks", {})

        # Skip initial state sync (don't speak about existing tasks)
        if not self._initialized:
            self._initialized = True
            for task_id, task in tasks.items():
                self._task_states[task_id] = task.get("state", "")
            logger.info(f"[Tunnel] Initialized with {len(tasks)} existing tasks")
            return

        # Check for tasks that transitioned to pending-user-feedback
        for task_id, task in tasks.items():
            prev_state = self._task_states.get(task_id)
            curr_state = task.get("state", "")

            self._task_states[task_id] = curr_state

            # Only trigger callback when task transitions TO pending-user-feedback
            if curr_state == "pending-user-feedback" and prev_state != curr_state:
                summary = task.get("summary") or task.get("result", "Task completed")
                logger.info(
                    f"[Tunnel] Task {task_id[:8]} ready for voice feedback: {summary[:50]}..."
                )
                await self._invoke_callback(summary)

    async def _invoke_callback(self, summary: str):
        """Invoke the registered callback with the task summary."""
        if not self._callback:
            return

        if asyncio.iscoroutinefunction(self._callback):
            await self._callback(summary)
        else:
            self._callback(summary)
