# Desktop Agent Standalone Testing

Quick guide to test the Claude SDK desktop agent locally.

## Prerequisites

1. **Environment Variables** - Create `../../.env` with:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # Optional
   MCP_SERVER_URL=https://your-memory-service.fly.dev  # Optional
   NIRMANUS_API_KEY=...  # Optional, for MCP
   ```

2. **uv** - Make sure uv is installed:
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

## Running Tests

### Test 1: REST API Test (Recommended)

Test the actual REST API server with multi-turn conversation:

```bash
# Terminal 1: Start the server
cd virtual-desktop-agent/agent
uv run server.py

# Terminal 2: Run the API test
cd virtual-desktop-agent/agent
uv run test_api.py
```

This tests:
- Creating sessions via REST API
- Sending queries via HTTP POST
- Multi-turn conversation with context
- Session management

### Test 2: Direct SDK Test (Optional)

Test Claude SDK directly without the server:

```bash
cd virtual-desktop-agent/agent
uv run test_agent.py
```

**Expected output:**
```
====================================================================
🧪 Testing Claude SDK Desktop Agent
====================================================================

✅ Found ANTHROPIC_API_KEY

🔧 Initializing Claude SDK client...
✅ Client initialized

------------------------------------------------------------
👤 User: What's the capital of France?
------------------------------------------------------------
🤖 Claude: The capital of France is Paris.

------------------------------------------------------------
👤 User: What's the population of that city?
------------------------------------------------------------
🤖 Claude: Paris has a population of approximately 2.2 million people...

------------------------------------------------------------
👤 User: Name one famous landmark there
------------------------------------------------------------
🤖 Claude: One famous landmark in Paris is the Eiffel Tower.

====================================================================
✅ Test completed successfully!
====================================================================
```

### Test with MCP Memory (Optional)

If you have MCP memory service configured:

```bash
# Set environment variables
export MCP_SERVER_URL=https://your-memory-service.fly.dev
export NIRMANUS_API_KEY=your-api-key

# Run test
uv run test_agent.py
```

This tests:
1. Storing user information in memory
2. Retrieving information from memory
3. Context retention across turns

## Running the Full Server

To test the full REST API server:

```bash
# Terminal 1: Start the server
cd virtual-desktop-agent/agent
uv run server.py

# Terminal 2: Test with curl
curl -X POST http://localhost:8080/session/create \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test123",
    "mcp_config": null,
    "user_id": "test_user"
  }'

curl -X POST http://localhost:8080/query \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test123",
    "message": "Hello! Tell me about yourself.",
    "stream": false
  }'

curl -X GET http://localhost:8080/sessions
```

## What the Test Does

### Test 1: Basic Conversation
1. Initializes Claude SDK client
2. Asks about capital of France → "Paris"
3. Asks about population (no country mentioned) → Claude remembers context
4. Asks about landmark (no city/country mentioned) → Claude still remembers

This demonstrates **context retention** across turns.

### Test 2: MCP Memory (Optional)
1. Tells Claude "My name is Alice and I love Python"
2. Claude stores this in MCP memory
3. Asks "What's my name and what do I like?"
4. Claude retrieves from memory and responds

This demonstrates **persistent memory** via MCP.

## Troubleshooting

### "ANTHROPIC_API_KEY not set"

Create `../../.env` file:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > ../../.env
```

### "Claude Agent SDK not installed"

```bash
uv add claude-agent-sdk
```

### "MCP test failed"

Make sure memory service is running and accessible:
```bash
curl https://your-memory-service.fly.dev/health
```

### Import errors

Sync all dependencies:
```bash
uv sync
```

## Development

### Add New Dependencies

```bash
uv add <package-name>
```

### Update Dependencies

```bash
uv sync --upgrade
```

### Run with Python directly

```bash
uv run python test_agent.py
```

## Next Steps

After testing locally:
1. Build E2B template with this agent
2. Test with voice agent integration
3. Deploy to production
