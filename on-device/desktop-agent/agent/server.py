"""
Desktop Agent Server with Claude SDK and MCP Integration

This server provides a REST API to interact with Claude Agent SDK
for executing complex desktop tasks with persistent memory.
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Dict, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from claude_agent_sdk import ClaudeSDKClient, AssistantMessage, TextBlock, ToolUseBlock, ResultMessage, ClaudeAgentOptions

load_dotenv("./.env")


# ============================================================================
# Logging & Terminal Output
# ============================================================================

class TerminalLogger:
    """Logger that prints to terminal for VNC visibility."""

    @staticmethod
    def log(message: str, level: str = "INFO"):
        """Log message with timestamp and level."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        icon = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "ERROR": "❌",
            "THINKING": "🤔",
            "TASK": "🔧",
            "MEMORY": "💾"
        }.get(level, "📝")

        print(f"[{timestamp}] {icon} {message}", flush=True)

    @staticmethod
    def log_assistant(text: str):
        """Log assistant response."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] 🤖 Claude: {text}", flush=True)

    @staticmethod
    def log_tool(tool_name: str, status: str = "started"):
        """Log tool usage."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        icon = "▶️" if status == "started" else "✅"
        print(f"[{timestamp}] {icon} Tool: {tool_name}", flush=True)


logger = TerminalLogger()


# ============================================================================
# Session Management
# ============================================================================

class SessionManager:
    """Manages Claude SDK client sessions."""

    def __init__(self):
        self.sessions: Dict[str, ClaudeSDKClient] = {}
        self.session_contexts: Dict[str, dict] = {}

    async def create_session(self, session_id: str, mcp_servers: Optional[dict] = None) -> ClaudeSDKClient:
        """Create a new Claude SDK session with MCP servers.

        Args:
            session_id: Unique identifier for the session
            mcp_servers: MCP server configurations, e.g.:
                {
                    "memory": {
                        "type": "http",
                        "url": "https://memory.fly.dev/mcp",
                        "headers": {"X-User-ID": "user_123"}
                    }
                }
        """
        if session_id in self.sessions:
            logger.log(f"Session {session_id} already exists", "INFO")
            return self.sessions[session_id]

        logger.log(f"Creating new session: {session_id}", "SUCCESS")

        # Log MCP configuration
        if mcp_servers:
            for name, config in mcp_servers.items():
                server_type = config.get('type', 'stdio')
                server_info = config.get('url') if server_type == 'http' else config.get('command', 'N/A')
                logger.log(f"MCP Server '{name}': {server_type} -> {server_info}", "INFO")

        # Initialize Claude SDK client
        # Pass mcpServers in options dict (correct format per Claude SDK docs)
        options = ClaudeAgentOptions(mcp_servers= mcp_servers or {}, model=os.getenv("ANTHROPIC_MODEL"))
        client = ClaudeSDKClient(
            options=options
        )

        self.sessions[session_id] = client
        self.session_contexts[session_id] = {
            "created_at": datetime.now().isoformat(),
            "mcp_servers": mcp_servers or {},
            "message_count": 0
        }

        logger.log(f"✅ Session created with {len(mcp_servers or {})} MCP servers", "SUCCESS")

        return client

    def get_session(self, session_id: str) -> Optional[ClaudeSDKClient]:
        """Get an existing session."""
        return self.sessions.get(session_id)

    async def close_session(self, session_id: str):
        """Close and remove a session."""
        if session_id in self.sessions:
            client = self.sessions[session_id]
            await client.close()
            del self.sessions[session_id]
            del self.session_contexts[session_id]
            logger.log(f"Closed session: {session_id}", "SUCCESS")


session_manager = SessionManager()


# ============================================================================
# API Models
# ============================================================================

class SessionCreate(BaseModel):
    session_id: str
    mcp_servers: Optional[dict] = None  # MCP server configurations
    user_id: Optional[str] = None


class Query(BaseModel):
    session_id: str
    message: str
    stream: bool = True


class TaskUpdate(BaseModel):
    """Task update for shared memory."""
    task_name: str
    status: str  # in-progress, blocked, completed
    details: Optional[str] = None
    query_for_human: Optional[str] = None


# ============================================================================
# FastAPI Application
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for the application."""
    logger.log("🚀 Desktop Agent Server Starting", "SUCCESS")
    logger.log(f"📍 API available at: http://localhost:8080", "INFO")
    yield
    # Cleanup
    logger.log("🛑 Shutting down Desktop Agent Server", "INFO")
    for session_id in list(session_manager.sessions.keys()):
        await session_manager.close_session(session_id)


app = FastAPI(
    title="Desktop Agent API",
    description="Claude SDK based desktop agent with MCP support",
    version="0.1.0",
    lifespan=lifespan
)


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "Desktop Agent",
        "status": "running",
        "active_sessions": len(session_manager.sessions)
    }


@app.post("/session/create")
async def create_session(request: SessionCreate):
    """Create a new conversation session."""
    try:
        logger.log(f"📥 New session request: {request.session_id}", "TASK")

        # Create session with MCP servers
        client = await session_manager.create_session(
            session_id=request.session_id,
            mcp_servers=request.mcp_servers
        )

        return {
            "session_id": request.session_id,
            "status": "created",
            "message": "Session created successfully"
        }
    except Exception as e:
        logger.log(f"Failed to create session: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/close")
async def close_session(session_id: str):
    """Close an existing session."""
    try:
        await session_manager.close_session(session_id)
        return {"session_id": session_id, "status": "closed"}
    except Exception as e:
        logger.log(f"Failed to close session: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query(request: Query):
    """Send a query to Claude and get response."""
    try:
        # Get session
        client = session_manager.get_session(request.session_id)
        if not client:
            raise HTTPException(status_code=404, detail=f"Session {request.session_id} not found")

        logger.log(f"💬 Query: {request.message}", "TASK")

        # Send query to Claude
        await client.query(request.message)

        # If streaming, return streaming response
        if request.stream:
            return StreamingResponse(
                stream_response(client, request.session_id),
                media_type="text/event-stream"
            )
        else:
            # Collect full response
            response_text = ""
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text
                        elif isinstance(block, ToolUseBlock):
                            logger.log_tool(block.name, "started")
                elif isinstance(message, ResultMessage):
                    logger.log_tool("tool", "completed")

            logger.log_assistant(response_text)

            return {
                "session_id": request.session_id,
                "response": response_text
            }

    except Exception as e:
        logger.log(f"Query failed: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))


async def stream_response(client: ClaudeSDKClient, session_id: str):
    """Stream Claude's response as SSE."""
    try:
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        # Log to terminal
                        logger.log_assistant(block.text)
                        # Stream to client
                        yield f"data: {json.dumps({'type': 'text', 'content': block.text})}\n\n"
                    elif isinstance(block, ToolUseBlock):
                        logger.log_tool(block.name, "started")
                        yield f"data: {json.dumps({'type': 'tool_use', 'tool': block.name})}\n\n"
            elif isinstance(message, ResultMessage):
                logger.log_tool("tool", "completed")
                yield f"data: {json.dumps({'type': 'tool_result'})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.log(f"Stream error: {str(e)}", "ERROR")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@app.get("/sessions")
async def list_sessions():
    """List all active sessions."""
    return {
        "sessions": [
            {
                "session_id": sid,
                "context": session_manager.session_contexts.get(sid, {})
            }
            for sid in session_manager.sessions.keys()
        ]
    }


# ============================================================================
# Task Update Endpoint (for shared memory)
# ============================================================================

@app.post("/task/update")
async def update_task(update: TaskUpdate):
    """Update task status in shared memory (to be called by agent)."""
    try:
        logger.log(
            f"Task Update: {update.task_name} - {update.status}",
            "MEMORY"
        )

        # Here you would update the shared memory (MCP memory tool)
        # For now, just log it

        return {
            "status": "updated",
            "task": update.task_name
        }
    except Exception as e:
        logger.log(f"Task update failed: {str(e)}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    logger.log("🚀 Starting Desktop Agent Server", "SUCCESS")
    logger.log("=" * 60, "INFO")
    logger.log("Claude SDK Desktop Agent with MCP Integration", "INFO")
    logger.log("=" * 60, "INFO")

    # Run server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="error"  # Suppress uvicorn logs, only show our logs
    )
