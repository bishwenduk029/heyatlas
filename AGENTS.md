# Nirmanus Agent Architecture

## Overview

Nirmanus is a multi-layered AI agent system that enables voice-driven automation with real-time task status updates. The system follows a conversational flow from human user to voice agent to specialized worker agents with full desktop and web automation capabilities.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Human User                                                 │
│  (Voice Input: "Hey Computer...")                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Voice Agent (main.py)                                      │
│  ┌─────────────────────────────────────────────────────────┐
│  │  • LiveKit Realtime Model                               │
│  │  • Persona-based instruction system                     │
│  │  • Memory MCP integration                               │
│  │  • Task orchestration                                   │
│  │  • Callback handlers for agent responses                │
│  └─────────────────────────────────────────────────────────┘
└────────────┬───────────────────────────────────┬────────────┘
             │                                   │
    (WebSocket)                          (WebSocket)
             │                                   │
    ┌────────▼────────┐              ┌──────────▼──────────┐
    │  Goose Agent    │              │  Agno Agent         │
    │  (E2B Sandbox)  │              │  (Computer-use)     │
    │                 │              │                     │
    │ • Desktop       │              │ • Browser MCP       │
    │   Automation    │              │ • Memory MCP        │
    │ • Task Execute  │              │ • Serena MCP        │
    │ • Status Upd.   │              │ • Status Updates    │
    └─────────────────┘              └─────────────────────┘
```

## Component Details

### 1. Voice Agent (`voice-agent/main.py`)

The main orchestrator that handles:

- **Voice I/O**: LiveKit Realtime Model for speech-to-text and text-to-speech
- **Persona Management**: Dynamic system prompts with user-specific context from memory
- **MCP Integration**: Connects to memory system for personalization
- **Agent Selection**: Routes tasks to Goose or Agno based on task requirements
- **Callback Management**: Handles responses and task updates from worker agents

**Key Methods:**

- `ask_computer()`: Main task execution endpoint
- `launch_computer()`: Initializes Goose or Agno worker agents
- `connect_with_computer_agent()`: Sets up callback handlers for agent responses and task updates
- `run_task()`: Routes task to selected worker agent

### 2. Agno Client (`agno-agent/agno_client.py`)

WebSocket client for communicating with Agno worker agents with **bidirectional task status updates**.

**Core Classes:**

- `TaskStatus` (Enum): Task execution states

  - `RUNNING`: Task is executing
  - `COMPLETED`: Task finished successfully
  - `NEEDS_INPUT`: Agent requires human input to proceed
  - `ERROR`: Task failed

- `TaskUpdate` (DataClass): Structured task status information
  - `status`: Current TaskStatus
  - `progress`: 0-100 completion percentage
  - `message`: Human-readable status description
  - `task_id`: Optional identifier for tracking
  - `estimated_time_remaining`: ETA in seconds
  - `required_input`: Dict with input details when status is NEEDS_INPUT
  - `error_details`: Error message when status is ERROR

**Key Methods:**

- `send_message(message: str)`: Send task to agent
- `send_task_update(task_update: TaskUpdate)`: Send status updates back to client
- `set_callback(callback)`: Register handler for agent responses
- `set_task_update_callback(callback)`: Register handler for task updates
- `connect(uri)`: Establish WebSocket connection
- `disconnect()`: Close connection gracefully

**Message Protocol:**

Outgoing (Voice Agent → Agno Worker):

```json
{
  "type": "message",
  "content": "User task description"
}
```

Incoming Response (Agno Worker → Voice Agent):

```json
{
  "type": "response",
  "content": "Agent response text"
}
```

Incoming Task Update (Agno Worker → Voice Agent):

```json
{
  "type": "task_update",
  "status": "running",
  "progress": 45,
  "message": "Analyzing page content...",
  "task_id": "task-12345",
  "estimated_time_remaining": 120
}
```

Error Update:

```json
{
  "type": "task_update",
  "status": "error",
  "progress": 0,
  "message": "Failed to open URL",
  "error_details": "Connection timeout after 30s"
}
```

Human Input Required:

```json
{
  "type": "task_update",
  "status": "needs_input",
  "progress": 50,
  "message": "Login required",
  "required_input": {
    "type": "credentials",
    "fields": ["username", "password"],
    "prompt": "Please provide your credentials"
  }
}
```

### 3. Agno Agent (`agno-agent/agent_main.py`)

The worker agent that executes tasks with MCP tools:

- **OpenRouter Model**: Z-AI GLM-4.6 for intelligent decision making
- **MCP Tools**:
  - Memory MCP: User context and conversation history
  - Web Browser MCP: Web automation and research
- **Streaming Support**: Real-time response streaming via WebSocket
- **Session Management**: Maintains context across multiple requests

**Usage of TaskUpdate:**

```python
from agno_client import AgnoClient, TaskUpdate, TaskStatus

client = AgnoClient()

# Start task
update = TaskUpdate(
    status=TaskStatus.RUNNING.value,
    progress=0,
    message="Starting browser automation...",
    task_id="task-123"
)
await client.send_task_update(update)

# Mid-task progress
update = TaskUpdate(
    status=TaskStatus.RUNNING.value,
    progress=50,
    message="Extracting data from page...",
    task_id="task-123",
    estimated_time_remaining=30
)
await client.send_task_update(update)

# If human input needed
update = TaskUpdate(
    status=TaskStatus.NEEDS_INPUT.value,
    progress=60,
    message="Authentication required",
    required_input={
        "type": "confirmation",
        "prompt": "Should I proceed with clicking 'Continue'?"
    }
)
await client.send_task_update(update)

# Task complete
update = TaskUpdate(
    status=TaskStatus.COMPLETED.value,
    progress=100,
    message="Task completed successfully"
)
await client.send_task_update(update)
```

### 4. Voice Agent Callback Integration

The voice agent registers handlers for task updates:

```python
async def agno_response_handler(response_text):
    # Forward agent response to user
    await session.generate_reply(
        instructions=f"Computer automation response: {response_text}",
        allow_interruptions=False,
    )

async def agno_task_update_handler(task_update: TaskUpdate):
    # Handle task progress updates
    if task_update.status == TaskStatus.RUNNING.value:
        await session.generate_reply(
            instructions=f"Task progress: {task_update.message} ({task_update.progress}%)",
            allow_interruptions=True,
        )
    elif task_update.status == TaskStatus.NEEDS_INPUT.value:
        await session.generate_reply(
            instructions=f"I need your input: {task_update.required_input['prompt']}",
            allow_interruptions=True,
        )
    elif task_update.status == TaskStatus.ERROR.value:
        await session.generate_reply(
            instructions=f"Error occurred: {task_update.error_details}",
            allow_interruptions=True,
        )

# Register handlers
agno_client.set_callback(agno_response_handler)
agno_client.set_task_update_callback(agno_task_update_handler)
```

## Data Flow Example: Web Search Task

```
1. User: "Hey Computer, search for AI news"
   ↓
2. Voice Agent: Infers task → "Search 'AI news 2025', extract top 5 articles"
   ↓
3. Voice Agent → Agno: send_message("search task...")
   ↓
4. Agno: Opens browser
   ↓
5. Agno → Voice Agent: send_task_update(running, progress=10%, "Opening browser...")
   ↓
6. Voice Agent → User: "Starting browser automation..."
   ↓
7. Agno: Navigates to search
   ↓
8. Agno → Voice Agent: send_task_update(running, progress=40%, "Searching articles...")
   ↓
9. Voice Agent → User: "Searching articles... 40% complete"
   ↓
10. Agno: Extracts content
   ↓
11. Agno → Voice Agent: send_task_update(running, progress=80%, "Extracting content...")
    ↓
12. Agno → Voice Agent: send_message("Found 5 articles: [list]")
    ↓
13. Voice Agent → User: "Here are the top AI news stories..."
    ↓
14. Agno → Voice Agent: send_task_update(completed, progress=100%, "Task complete")
```

## Configuration

### Environment Variables

```env
# Voice Agent
OPENAI_API_KEY=your_key
LIVEKIT_URL=your_livekit_url
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret

# Agno Agent
OPENROUTER_API_KEY=your_key
AGNO_WS_URL=ws://localhost:8001/ws

# MCP Servers
MCP_SERVER_URL=http://localhost:8000

# Computer Provider
COMPUTER_PROVIDER=e2b
E2B_API_KEY=your_key
```

## Future Enhancements

- [ ] Task history and replay
- [ ] Parallel task execution
- [ ] More granular progress metrics
- [ ] Task cancellation support
- [ ] Timeout handling with auto-retry
- [ ] Performance metrics and analytics
