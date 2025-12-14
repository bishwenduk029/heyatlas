# Desktop Agent with Claude SDK

A Claude Agent SDK-powered desktop agent that runs in E2B virtual environments with MCP integration for persistent memory and tool access.

## Architecture

```
Voice Agent (LiveKit + OpenAI Realtime)
    ↓ [launches]
E2B Sandbox (Desktop Environment)
    ├── Desktop Agent Server (FastAPI + Claude SDK)
    │   ├── MCP Memory Integration
    │   ├── Session Management
    │   └── REST API
    └── VNC Display (visible to user)
```

## Components

### 1. Desktop Agent Server (`agent/server.py`)

A FastAPI-based REST API that wraps Claude Agent SDK:

- **Session Management**: Create and manage persistent conversation sessions
- **MCP Integration**: Connects to memory service via HTTP MCP
- **Terminal Logging**: All agent actions are logged to terminal (visible in VNC)
- **REST API**: Endpoints for voice agent to communicate with desktop agent

**Key Endpoints:**
- `POST /session/create` - Create new agent session with MCP config
- `POST /query` - Send task to agent (streaming or non-streaming)
- `POST /session/close` - Close agent session
- `GET /sessions` - List active sessions

### 2. Voice Agent Tools (`voice-agent/main.py`)

New tools for voice agent to manage desktop agents:

- **`launch_desktop_agent()`**: Creates E2B sandbox, starts desktop agent server, displays VNC
- **`query_desktop_agent(session_id, task)`**: Sends tasks to running desktop agent
- **`execute_complex_task(task)`**: Legacy Goose-based execution (deprecated)

### 3. E2B Template Configuration

The E2B Dockerfile includes:
- Python environment with FastAPI and Claude SDK
- Desktop agent code (server + startup script)
- Auto-start capability via xfce4-terminal

## Usage Flow

### 1. Launch Desktop Agent

```python
# Voice agent calls:
await launch_desktop_agent()

# This:
# 1. Creates E2B sandbox with desktop environment
# 2. Starts desktop agent server on port 8080
# 3. Creates Claude SDK session with MCP memory integration
# 4. Displays VNC stream to user
# 5. Opens terminal showing agent logs
# 6. Returns session_id for future interactions
```

### 2. Send Tasks to Desktop Agent

```python
# Voice agent calls:
await query_desktop_agent(
    session_id="sandbox_abc123",
    task="Research the latest AI developments and save key points to memory"
)

# Desktop agent:
# 1. Receives task via REST API
# 2. Processes with Claude SDK (with MCP tools)
# 3. Logs all actions to terminal (visible in VNC)
# 4. Updates shared memory via MCP
# 5. Returns response to voice agent
```

### 3. Multi-Turn Conversations

```python
# First task
await query_desktop_agent(session_id, "Find Python tutorials")

# Follow-up (Claude remembers context)
await query_desktop_agent(session_id, "Summarize the best one")

# Another follow-up
await query_desktop_agent(session_id, "Save it to my learning resources")
```

## MCP Integration

The desktop agent connects to the memory service via HTTP MCP:

```python
mcp_config = {
    "http_mcp": {
        "url": "https://memory-service.fly.dev/mcp",
        "headers": {
            "NIRMANUS_API_KEY": "...",
            "X-User-ID": "user_123"
        }
    }
}
```

This gives Claude SDK access to:
- `store_memory(information, metadata)` - Store user preferences, facts, tasks
- `find_memories(query, limit)` - Search relevant memories
- `get_all_memories()` - List all memories

## Environment Variables

### Desktop Agent (E2B Sandbox)

```bash
ANTHROPIC_API_KEY=sk-ant-...       # Claude API key
MCP_SERVER_URL=https://...         # Memory service URL
NIRMANUS_API_KEY=...               # API key for memory service
```

### Voice Agent

```bash
E2B_DESKTOP_TEMPLATE_ID=heycomputer-desktop-agent
E2B_API_KEY=...
ANTHROPIC_API_KEY=...
MCP_SERVER_URL=...
NIRMANUS_API_KEY=...
```

## Building E2B Template

```bash
# From virtual-desktop-agent directory
cd e2b
e2b template build -c e2b.Dockerfile

# Get template ID and set in voice-agent .env
export E2B_DESKTOP_TEMPLATE_ID=<your-template-id>
```

## Advantages Over Goose

1. **Better Control**: Direct API access to Claude SDK vs. CLI tool
2. **Streaming Responses**: Can get real-time updates from agent
3. **Customizable**: Full control over agent behavior and tools
4. **Memory Integration**: Built-in MCP memory for context persistence
5. **Session Management**: Multiple persistent sessions per user
6. **Visual Feedback**: Terminal logs show exactly what AI is doing
7. **REST API**: Easy integration with any client

## Development

### Local Testing

```bash
# Run desktop agent locally
cd agent
python server.py

# Test with curl
curl -X POST http://localhost:8080/session/create \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test", "mcp_config": {...}}'

curl -X POST http://localhost:8080/query \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test", "message": "Hello!", "stream": false}'
```

### Adding Custom Tools

Claude SDK automatically discovers and uses MCP tools. To add more:

1. Add MCP server to `mcp_config` in `launch_desktop_agent()`
2. Claude will automatically see and use the tools
3. All tool usage is logged to terminal

## Future Enhancements

- [ ] Streaming responses to voice agent
- [ ] Task queuing and background execution
- [ ] Multiple desktop agents per user
- [ ] Agent-to-agent communication
- [ ] Custom tool definitions beyond MCP
- [ ] Web interface for debugging sessions
- [ ] Metrics and observability
