"""
Workforce Callbacks - Stream events for real-time UI updates.

Implements WorkforceCallback to emit task/worker lifecycle events
that can be consumed via SSE or HTTP callback.
"""

import os
import time
import logging
import asyncio
import httpx
from typing import Optional, Any
from dataclasses import dataclass, asdict
from camel.societies.workforce.workforce_callback import WorkforceCallback

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(message)s')
logger = logging.getLogger("AgentSmith")


@dataclass
class WorkforceEventData:
    """Event payload for Atlas UI."""
    event_type: str
    timestamp: float
    task_id: Optional[str] = None
    task_content: Optional[str] = None
    worker_name: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None
    subtasks: Optional[list] = None
    metadata: Optional[dict] = None


# Global event queue for SSE streaming
_event_queues: dict[str, asyncio.Queue] = {}


def get_event_queue(task_id: str) -> asyncio.Queue:
    """Get or create an event queue for a task."""
    if task_id not in _event_queues:
        _event_queues[task_id] = asyncio.Queue()
    return _event_queues[task_id]


def cleanup_event_queue(task_id: str) -> None:
    """Remove event queue after task completes."""
    _event_queues.pop(task_id, None)


class StreamingCallback(WorkforceCallback):
    """
    Streams workforce events to an async queue for SSE consumption.
    Also supports HTTP callback for remote deployments.
    """

    def __init__(self, task_id: str):
        super().__init__()
        self.task_id = task_id
        self.queue = get_event_queue(task_id)
        
        # Optional HTTP callback for remote deployments
        self.callback_url = os.getenv("ATLAS_CALLBACK_URL")
        self.user_id = os.getenv("SANDBOX_USER_ID")
        self._client: Optional[httpx.Client] = None
        if self.callback_url:
            self._client = httpx.Client(timeout=10.0)

    def _log(self, icon: str, event_type: str, msg: str) -> None:
        """Log with emoji for visibility."""
        logger.info(f"{icon} [{event_type}] {msg[:100]}")

    def _emit(self, event: WorkforceEventData) -> None:
        """Emit event to queue and optionally HTTP."""
        # Push to async queue for SSE
        try:
            self.queue.put_nowait(asdict(event))
        except Exception as e:
            logger.warning(f"Failed to queue event: {e}")
        
        # Also send via HTTP if configured
        if self._client and self.callback_url:
            try:
                self._client.post(self.callback_url, json={
                    "type": "workforce_event",
                    "userId": self.user_id,
                    "taskId": self.task_id,
                    "event": asdict(event),
                })
            except Exception as e:
                logger.warning(f"HTTP callback failed: {e}")

    # WorkforceCallback interface

    def log_task_created(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        content = getattr(task, 'content', str(task))[:80]
        self._log("📋", "task_created", content)
        self._emit(WorkforceEventData(
            event_type="task_created",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
        ))

    def log_task_decomposed(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        subtasks = getattr(event, 'subtasks', [])
        content = getattr(task, 'content', str(task))[:60]
        self._log("🔀", "task_decomposed", f"{content} -> {len(subtasks)} subtasks")
        self._emit(WorkforceEventData(
            event_type="task_decomposed",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
            subtasks=[getattr(st, 'content', str(st))[:50] for st in subtasks[:5]],
        ))

    def log_task_assigned(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        worker = getattr(event, 'worker', None)
        worker_name = getattr(worker, 'description', str(worker))[:50] if worker else "worker"
        content = getattr(task, 'content', str(task))[:60]
        self._log("👤", "task_assigned", f"{content} -> {worker_name}")
        self._emit(WorkforceEventData(
            event_type="task_assigned",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
            worker_name=worker_name,
        ))

    def log_task_started(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        content = getattr(task, 'content', str(task))[:80]
        self._log("▶️", "task_started", content)
        self._emit(WorkforceEventData(
            event_type="task_started",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
        ))

    def log_task_completed(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        result = getattr(event, 'result', None)
        content = getattr(task, 'content', str(task))[:60]
        result_str = str(result)[:100] if result else ""
        self._log("✅", "task_completed", f"{content}")
        self._emit(WorkforceEventData(
            event_type="task_completed",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
            result=result_str,
        ))

    def log_task_failed(self, event: Any) -> None:
        task = getattr(event, 'task', event)
        error = getattr(event, 'error', None)
        content = getattr(task, 'content', str(task))[:60]
        error_str = str(error)[:100] if error else ""
        self._log("❌", "task_failed", f"{content}: {error_str}")
        self._emit(WorkforceEventData(
            event_type="task_failed",
            timestamp=time.time(),
            task_id=getattr(task, 'id', None),
            task_content=content,
            error=error_str,
        ))

    def log_worker_created(self, event: Any) -> None:
        worker = getattr(event, 'worker', event)
        name = getattr(worker, 'description', str(worker))[:80]
        self._log("🤖", "worker_created", name)
        self._emit(WorkforceEventData(
            event_type="worker_created",
            timestamp=time.time(),
            worker_name=name,
        ))

    def log_worker_deleted(self, event: Any) -> None:
        worker = getattr(event, 'worker', event)
        name = getattr(worker, 'description', str(worker))[:80]
        self._log("🗑️", "worker_deleted", name)

    def log_all_tasks_completed(self, event: Any) -> None:
        self._log("🎉", "all_tasks_completed", "Done!")
        self._emit(WorkforceEventData(
            event_type="all_tasks_completed",
            timestamp=time.time(),
        ))
        # Signal end of stream
        try:
            self.queue.put_nowait(None)
        except Exception:
            pass

    def log_message(self, event: Any) -> None:
        msg = getattr(event, 'message', str(event))[:100]
        self._log("📌", "message", msg)

    def __del__(self):
        if self._client:
            self._client.close()


# Keep old name for backwards compatibility
AtlasCallback = StreamingCallback
