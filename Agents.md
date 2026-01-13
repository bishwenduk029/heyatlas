# Atlas Agent Architecture

## Most important principle keep things stupid simple. No complexity , no overcoding just mininmal , simple and easy to read modular code that easy to change in near future give new enhancements. BEAUTY IS IN SIMPLICITY

## Overview

Atlas is a Cloudflare Durable Object-based AI agent that extends `AIChatAgent` from the `agents` framework. It provides persistent chat with automatic memory management, task delegation, and real-time state synchronization.

## Core Components

### Backend (`atlas/src/`)

#### `agent.ts` - AtlasAgent Class

Extends `AIChatAgent<Env, AgentState>` which provides:

- **SQLite-backed message persistence** via `cf_ai_chat_agent_messages` table
- **`this.messages`** - In-memory array of `ChatMessage` objects, auto-loaded from DB
- **`persistMessages(messages)`** - Saves to DB and reloads `this.messages` (upsert only, doesn't delete)
- **`this.sql`** - Tagged template for raw SQL queries
- **`this.broadcast(msg)`** - Send to all connected WebSocket clients
- **`this.setState(state)`** - Update and sync state to all clients

Key methods:

- `onChatMessage()` - Override to handle incoming chat, return Response with stream
- `prepareModelMessages()` - Called before LLM invocation, handles message transformation
- `onConnect()` / `onStateUpdate()` - Lifecycle hooks for connections and state changes

#### `types.ts` - AgentState Interface

```typescript
interface AgentState {
  credentials: UserCredentials | null;
  tier: Tier;
  sandbox: SandboxMetadata | null;
  tasks: Record<string, Task>;
  activeAgent: string | null; // CLI agent connection
  interactiveMode: boolean;
  compressing: boolean; // Memory summarization in progress
  // ... other fields
}
```

### Frontend (`web/src/components/voice/`)

#### State Flow

```
useAtlasAgent (hook)
    ↓ returns { messages, tasks, activeAgent, compressing, ... }
InterfaceWithAgent
    ↓ passes props
SessionLayout
    ↓ passes props
ChatInterface
    ↓ passes props
ChatInput (displays status indicators)
```

#### `hooks/use-atlas-agent.ts`

Central hook for Atlas connection:

```typescript
const atlasAgent = useAtlasAgent({ userId, token });

// Returns:
atlasAgent.isConnected; // WebSocket connected
atlasAgent.isLoading; // Chat request in progress
atlasAgent.messages; // Formatted message array
atlasAgent.tasks; // Task list from state
atlasAgent.activeAgent; // CLI agent ID if connected
atlasAgent.compressing; // Memory summarization active
atlasAgent.sendMessage(); // Send chat message
atlasAgent.stop(); // Cancel current request
```

Uses `useAgent()` for WebSocket connection with `onStateUpdate` callback for real-time state sync.

#### Component Props Pattern

Props flow through component hierarchy:

1. Add to interface/props type
2. Destructure in component
3. Pass to child components
4. Use in UI rendering

## Memory Management

### Message Summarization (`prepareModelMessages`)

When `this.messages.length > 25`:

1. Set `compressing: true` state (broadcasts to UI)
2. Keep last 25 messages
3. Summarize older messages via `generateText()` into first-person assistant summary
4. **Delete all messages from DB** (required because `persistMessages` only upserts)
5. Persist new array: `[summaryMessage, ...recentMessages]`
6. Set `compressing: false` state

```typescript
// Key pattern: DB must be cleared before persisting reduced message set
this.sql`delete from cf_ai_chat_agent_messages`;
await this.persistMessages([summaryMessage, ...remainingMessages]);
```

## Real-time State Sync

State changes flow automatically:

1. Backend: `this.setState({ ...this.state, newField: value })`
2. Cloudflare syncs to all WebSocket clients
3. Frontend: `onStateUpdate` callback fires in `useAgent()`
4. Hook updates local React state
5. Components re-render with new values

## UI Components

### Reusable Components (`web/src/components/ai-elements/`)

- **`Shimmer`** - Animated text shimmer effect using Framer Motion
- Use existing components before creating CSS animations

### Status Indicators (`ChatInput`)

Trapezoid header shows contextual status:

- Green pulse: Agent connected
- Amber spinner + shimmer: Memory compressing

## Task System

Tasks are stored in `state.tasks` (Record<string, Task>):

- Created via `createTask(description)`
- States: `new` → `in-progress` → `completed`/`failed`
- CLI picks up `new` tasks, updates state as work progresses
- UI receives updates via state sync

## Best Practices

1. **Message persistence**: Always clear DB before persisting reduced message sets
2. **State updates**: Use spread operator to preserve other state fields
3. **Props drilling**: Follow existing pattern through component hierarchy
4. **Existing components**: Check `ai-elements/` before creating new UI primitives
5. **Logging**: Use `[Atlas]` prefix for backend logs to aid debugging
