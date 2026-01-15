#!/usr/bin/env python3
"""
Agent Smith - Multi-Agent Workforce

Entry point for the CAMEL-AI based multi-agent system.
Runs as an HTTP server that accepts tasks and streams progress via SSE.

Usage:
    python main.py                    # Start HTTP server on port 3141
    python main.py --port 8080        # Custom port
    python main.py --task "Do X"      # Run single task directly
"""

import os
import sys
import json
import asyncio
import argparse
import logging
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from camel.tasks import Task
from src.workforce import create_workforce_with_callback
from src.callbacks import get_event_queue, cleanup_event_queue, StreamingCallback

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("AgentSmith")

app = FastAPI(title="Agent Smith", description="Multi-Agent Workforce API")


class TaskRequest(BaseModel):
    """Request body for task execution."""

    prompt: str
    task_id: Optional[str] = None


class TaskResponse(BaseModel):
    """Response from task execution."""

    task_id: str
    status: str
    result: Optional[str] = None
    error: Optional[str] = None


@app.on_event("startup")
async def startup():
    """Log startup info."""
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    print(f"🚀 Agent Smith starting...", flush=True)
    print(
        f"   API Key: {'✅ Set (' + api_key[:10] + '...)' if api_key else '❌ NOT SET'}",
        flush=True,
    )
    print(f"   Model: {os.getenv('MODEL_NAME', 'openai/gpt-4o-mini')}", flush=True)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "agent": "agent-smith-py"}


@app.post("/agents/agent-smith/text", response_model=TaskResponse)
async def execute_task(request: TaskRequest):
    """
    Execute a task using the multi-agent workforce.
    Returns final result (non-streaming).
    """
    task_id = request.task_id or f"task_{id(request)}"

    try:
        print(f"[Task {task_id[:8]}] Received: {request.prompt[:80]}...", flush=True)

        # Create workforce with task-specific callback
        callback = StreamingCallback(task_id)
        workforce = await create_workforce_with_callback(callback)
        print(f"[Task {task_id[:8]}] Workforce ready", flush=True)

        # Create CAMEL Task
        task = Task(
            content=request.prompt,
            id=task_id,
        )

        # Process task asynchronously
        print(f"[Task {task_id[:8]}] Processing...", flush=True)
        result = await workforce.process_task_async(task)

        result_text = (
            str(result.result) if result and result.result else "Task completed"
        )
        print(f"[Task {task_id[:8]}] ✅ Done: {result_text[:100]}...", flush=True)

        # Cleanup
        cleanup_event_queue(task_id)

        return TaskResponse(
            task_id=task_id,
            status="completed",
            result=result_text[:2000],
        )

    except Exception as e:
        logger.error(f"[Task {task_id[:8]}] ❌ Failed: {e}")
        import traceback

        traceback.print_exc()
        cleanup_event_queue(task_id)
        return TaskResponse(
            task_id=task_id,
            status="failed",
            error=str(e)[:500],
        )


@app.post("/agents/agent-smith/stream")
async def execute_task_stream(request: TaskRequest):
    """
    Execute a task and stream progress events via SSE.

    Events are newline-delimited JSON objects with workforce lifecycle events.
    The final event has event_type="result" with the task result.
    """
    task_id = request.task_id or f"task_{id(request)}"

    async def event_stream():
        try:
            print(
                f"[Task {task_id[:8]}] Streaming: {request.prompt[:80]}...", flush=True
            )

            # Create workforce with task-specific callback
            callback = StreamingCallback(task_id)
            workforce = await create_workforce_with_callback(callback)
            queue = get_event_queue(task_id)

            # Create CAMEL Task
            task = Task(
                content=request.prompt,
                id=task_id,
            )

            # Start task processing in background
            async def run_task():
                try:
                    result = await workforce.process_task_async(task)
                    result_text = (
                        str(result.result)
                        if result and result.result
                        else "Task completed"
                    )
                    # Send final result event
                    await queue.put(
                        {
                            "event_type": "result",
                            "timestamp": __import__("time").time(),
                            "task_id": task_id,
                            "result": result_text[:2000],
                            "status": "completed",
                        }
                    )
                except Exception as e:
                    await queue.put(
                        {
                            "event_type": "result",
                            "timestamp": __import__("time").time(),
                            "task_id": task_id,
                            "error": str(e)[:500],
                            "status": "failed",
                        }
                    )
                finally:
                    await queue.put(None)  # Signal end

            # Start background task
            asyncio.create_task(run_task())

            # Stream events
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=600)
                    if event is None:
                        break
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'event_type': 'timeout', 'task_id': task_id})}\n\n"
                    break

        except Exception as e:
            yield f"data: {json.dumps({'event_type': 'error', 'error': str(e)})}\n\n"
        finally:
            cleanup_event_queue(task_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/task")
async def simple_task(request: TaskRequest):
    """Simplified task endpoint."""
    return await execute_task(request)


async def run_single_task(prompt: str) -> str:
    """Run a single task directly (CLI mode)."""
    from src.workforce import create_workforce

    workforce = await create_workforce()
    task = Task(content=prompt, id="cli_task")

    logger.info(f"Executing: {prompt[:100]}...")
    result = workforce.process_task(task)

    return str(result.result) if result and result.result else "Done"


def main():
    parser = argparse.ArgumentParser(description="Agent Smith - Multi-Agent Workforce")
    parser.add_argument("--port", type=int, default=3141, help="Server port")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--task", type=str, help="Run single task and exit")
    args = parser.parse_args()

    if args.task:
        # CLI mode: run single task
        import asyncio
        result = asyncio.run(run_single_task(args.task))
        print(f"\nResult:\n{result}")
        return

    # Server mode
    logger.info(f"Starting Agent Smith on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
