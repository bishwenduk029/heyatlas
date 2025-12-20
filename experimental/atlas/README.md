# Atlas - Hybrid AI Agent Architecture

This is an experimental implementation of a hybrid architecture:
- **Transport (PartyKit)**: User-scoped Durable Objects for credential storage, WebSocket relay, and HTTP proxy
- **Agent (VoltAgent)**: AI/LLM processing with per-user credentials

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│              (CLI, Web, Voice Agent)                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌───────────────────┐         ┌───────────────────┐
│   WebSocket       │         │      HTTP         │
│   + Auth Token    │         │   + Auth Token    │
└────────┬──────────┘         └────────┬──────────┘
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Transport Layer (PartyKit)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ DO: user-123 │  │ DO: user-456 │  │ DO: user-789 │           │
│  │ virtualKey:A │  │ virtualKey:B │  │ virtualKey:C │           │
│  │ prefs: {...} │  │ prefs: {...} │  │ prefs: {...} │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  • User-scoped Durable Objects (roomId = userId)                 │
│  • Stores per-user virtual keys & preferences                    │
│  • WebSocket relay for real-time messages                        │
│  • HTTP proxy with credential injection                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP + X-Provider-API-Key headers
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent (VoltAgent Worker)                      │
│                                                                  │
│  • Receives per-user credentials from transport                  │
│  • Creates dynamic provider per request                          │
│  • AI/LLM processing via serverless-hono                         │
│  • Usage tracked per user's virtual key                          │
└─────────────────────────────────────────────────────────────────┘
```

## User Credential Flow

```
1. User connects to PartyKit with auth token
2. Transport verifies token via /api/me
3. Auth API returns user data + virtualKey
4. Transport stores virtualKey in user's Durable Object
5. On agent requests, transport injects:
   - X-Provider-API-Key: <user's virtual key>
   - X-Provider-API-URL: <provider URL>
   - X-User-ID: <user id>
6. VoltAgent uses per-user credentials for LLM calls
7. Usage is tracked downstream per virtual key
```

## Setup

### 1. Agent (VoltAgent Worker)

```bash
cd agent
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API credentials
pnpm install
pnpm dev
# Runs on http://localhost:8788
```

### 2. Transport (PartyKit)

```bash
cd transport
cp .env.example .env
# Edit .env with your configuration
pnpm install
VOLTAGENT_URL=http://localhost:8788 pnpm dev
# Runs on http://localhost:1999
```

## API

### WebSocket (via Transport)

Connect to: `wss://atlas-transport.{user}.partykit.dev/party/{userId}?token={authToken}`

Messages:
```json
// Request agent stream
{ "type": "agent:stream", "agentId": "atlas-assistant", "message": "Hello" }

// Request agent text (non-streaming)
{ "type": "agent:text", "agentId": "atlas-assistant", "message": "Hello" }
```

### HTTP (via Transport proxy to Agent)

Use `?proxy=/path` query param to proxy to VoltAgent:

- `GET /party/{roomId}` - Room status
- `GET /party/{roomId}?proxy=/agents` - List agents
- `POST /party/{roomId}?proxy=/agents/{id}/text` - Non-streaming completion
- `POST /party/{roomId}?proxy=/agents/{id}/stream` - Streaming completion

Example:
```bash
# Room status (shows if credentials are loaded)
curl "http://localhost:1999/party/user123"

# List agents
curl "http://localhost:1999/party/user123?proxy=/agents"

# Send message (uses user's virtual key)
curl -X POST "http://localhost:1999/party/user123?proxy=/agents/atlas-assistant/text" \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello!"}'
```

## Benefits of This Architecture

1. **User Isolation**: Each user has their own Durable Object (roomId = userId)
2. **Credential Storage**: Virtual keys stored in DO, persisted across sessions
3. **Per-User Tracking**: LLM usage tracked per virtual key downstream
4. **Gating Ready**: Easy to implement user quotas based on usage
5. **Low Latency**: Credentials in-memory after first load
6. **Scalable**: DOs distributed across Cloudflare's edge
