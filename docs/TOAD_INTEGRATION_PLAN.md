# Toad Integration Plan: Dual-Channel Event Routing

## Overview

Integrate HeyAtlas with Toad (ACP-based agent orchestrator) using a dual-channel architecture:
- **Stored Channel**: Persistent events in `task.context` (messages, completions)
- **Broadcast Channel**: Ephemeral events for real-time UI (tool calls, thinking, status)

This saves storage while enabling rich real-time UI updates.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CLI (heyatlas/cli)          Atlas Agent (CF DO)           Web UI           │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐│
│  │  Droid Agent    │         │                 │         │ useAtlasAgent   ││
│  │                 │ appendContext()           │ setState │                 ││
│  │  streamHandler  │────────►│  task.context   │────────►│ tasks state     ││
│  │  parse events   │         │  (stored)       │         │ (from state)    ││
│  │                 │         │                 │         │                 ││
│  └─────────────────┘         │                 │         │ task-list.tsx   ││
│                              │ update_human()  │broadcast│ shows context   ││
│                              │────────────────►│────────►│                 ││
│                              │ (voice only)    │         │                 ││
│                              └─────────────────┘         └─────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEW FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CLI / Toad                  Atlas Agent (CF DO)           Web UI           │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐│
│  │  Toad Agent     │         │                 │         │ useAtlasAgent   ││
│  │                 │ appendContext()           │ setState │                 ││
│  │  Message Router │────────►│  task.context   │────────►│ tasks state     ││
│  │                 │         │  (stored)       │         │ (persistent)    ││
│  │  ┌───────────┐  │         │                 │         │                 ││
│  │  │ToolCall   │  │broadcastTaskEvent()      │broadcast│ ephemeralEvents ││
│  │  │Thinking   │──┼────────►│ (not stored)   │────────►│ (real-time)     ││
│  │  │Status     │  │         │                 │         │                 ││
│  │  └───────────┘  │         │                 │         │ task-viewer.tsx ││
│  └─────────────────┘         └─────────────────┘         │ (merged view)   ││
│                                                          └─────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Event Classification

### Stored Events (task.context)
These events are important for conversation history and context reconstruction:

| Event Type | Description | Example Data |
|------------|-------------|--------------|
| `message` | User/assistant messages | `{role: "user", content: "..."}` |
| `completion` | Task completion | `{summary: "...", result: "..."}` |

### Broadcast Events (ephemeral)
These events are for real-time UI display only:

| Event Type | Toad Message | Description |
|------------|--------------|-------------|
| `tool_call` | `ToolCall` | Tool invocation started |
| `tool_update` | `ToolCallUpdate` | Tool progress/result |
| `thinking` | `Thinking` | Model thinking indicator |
| `plan` | `Plan` | Plan entries |
| `status` | `UpdateStatusLine` | Status line updates |
| `permission` | `RequestPermission` | Permission request (UI action needed) |

---

## Implementation Plan

### Phase 1: AtlasTunnel Enhancement (CLI)

**File: `cli/tunnel/AtlasTunnel.ts`**

```typescript
// Add new broadcast method
async broadcastTaskEvent(taskId: string, event: StreamEvent): Promise<void> {
  if (!this.client || !this._isConnected) return;
  
  try {
    await this.client.call("broadcast_task_event", [taskId, event]);
  } catch (error) {
    // Non-critical: log and continue (ephemeral events can be lost)
    console.debug(`Broadcast failed for task ${taskId.slice(0,8)}:`, error);
  }
}
```

**File: `cli/agents/types.ts`**

```typescript
// Add event classification helper
export type StoredEventType = "message" | "completion";
export type BroadcastEventType = "tool_call" | "tool_update" | "thinking" | "plan" | "status" | "permission";

export function isStoredEvent(event: StreamEvent): boolean {
  if (event.type === "message") {
    const role = event.data?.role;
    return role === "user" || role === "assistant";
  }
  return event.type === "completion";
}
```

**File: `cli/agents/base.ts`**

```typescript
// Update event routing in run()
for (const event of events) {
  onStreamEvent?.(event);
  
  if (tunnel && taskId) {
    if (isStoredEvent(event)) {
      // Store in task.context
      tunnel.appendContext(taskId, [event]);
    } else {
      // Broadcast for UI only
      tunnel.broadcastTaskEvent(taskId, event);
    }
    
    // Voice update on completion
    if (event.type === "completion" && event.data.summary) {
      tunnel.updateHuman(event.data.summary as string);
    }
  }
}
```

---

### Phase 2: Atlas Agent Enhancement (Cloudflare)

**File: `atlas/src/agent.ts`**

```typescript
import { callable } from "agents";

// Add callable method for task event broadcasts
@callable({ description: "Broadcast ephemeral task event to UI" })
broadcast_task_event(taskId: string, event: StreamEvent): void {
  this.broadcast(JSON.stringify({
    type: "task_event",
    taskId,
    event,
    timestamp: Date.now(),
  }));
}
```

**File: `atlas/src/types.ts`**

```typescript
// Add broadcast event type
export interface TaskEventBroadcast {
  type: "task_event";
  taskId: string;
  event: StreamEvent;
  timestamp: number;
}

export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}
```

---

### Phase 3: Web UI Enhancement

**File: `web/src/components/voice/hooks/use-atlas-agent.ts`**

```typescript
// Add ephemeral events state
const [ephemeralEvents, setEphemeralEvents] = useState<Map<string, StreamEvent[]>>(new Map());

// Handle broadcast messages (add to useAgent options)
const handleMessage = useCallback((msg: MessageEvent) => {
  try {
    const data = JSON.parse(msg.data);
    if (data.type === "task_event") {
      setEphemeralEvents(prev => {
        const newMap = new Map(prev);
        const events = newMap.get(data.taskId) || [];
        // Keep last N events per task to prevent memory bloat
        const updated = [...events, data.event].slice(-50);
        newMap.set(data.taskId, updated);
        return newMap;
      });
    }
  } catch {}
}, []);

// Expose in return
return {
  // ... existing
  ephemeralEvents,
  getTaskEphemeralEvents: useCallback((taskId: string) => 
    ephemeralEvents.get(taskId) || [], [ephemeralEvents]),
};
```

**File: `web/src/components/voice/task-viewer.tsx`** (new component)

```tsx
interface TaskViewerProps {
  task: AtlasTask;
  ephemeralEvents: StreamEvent[];
}

export function TaskViewer({ task, ephemeralEvents }: TaskViewerProps) {
  // Merge stored context with ephemeral events for display
  const allEvents = useMemo(() => {
    const stored = task.context.map(e => ({ ...e, stored: true }));
    const ephemeral = ephemeralEvents.map(e => ({ ...e, stored: false }));
    return [...stored, ...ephemeral].sort((a, b) => a.timestamp - b.timestamp);
  }, [task.context, ephemeralEvents]);

  return (
    <div className="task-viewer">
      {allEvents.map((event, i) => (
        <TaskEventItem 
          key={`${event.timestamp}-${i}`} 
          event={event}
          isEphemeral={!event.stored}
        />
      ))}
    </div>
  );
}

function TaskEventItem({ event, isEphemeral }: { event: StreamEvent; isEphemeral: boolean }) {
  switch (event.type) {
    case "tool_call":
      return <ToolCallEvent event={event} />;
    case "thinking":
      return <ThinkingIndicator text={event.data.text as string} />;
    case "message":
      return <MessageBubble role={event.data.role as string} content={event.data.content as string} />;
    case "status":
      return <StatusLine text={event.data.text as string} />;
    default:
      return null;
  }
}
```

---

### Phase 4: Toad Integration (Minimal Changes)

**Option A: Toad as Message Source (Recommended)**

Toad already has a pluggable `_message_target` pattern. We add an AtlasTunnel target:

**File: `toad/src/toad/acp/atlas_target.py`** (new)

```python
"""Atlas message target for forwarding toad events to HeyAtlas."""

from typing import Protocol, Any
from toad.acp import messages

class AtlasClientProtocol(Protocol):
    """Interface for Atlas tunnel client."""
    def append_context(self, task_id: str, events: list[dict]) -> None: ...
    def broadcast_event(self, task_id: str, event: dict) -> None: ...
    def update_human(self, summary: str) -> None: ...

# Event type mapping: toad message class -> StreamEvent type
EVENT_TYPE_MAP = {
    messages.Update: "message",
    messages.Thinking: "thinking", 
    messages.ToolCall: "tool_call",
    messages.ToolCallUpdate: "tool_update",
    messages.Plan: "plan",
    messages.UpdateStatusLine: "status",
    messages.RequestPermission: "permission",
}

STORED_TYPES = {"message", "completion"}

class AtlasMessageTarget:
    """Routes toad messages to AtlasTunnel with dual-channel logic."""
    
    def __init__(self, atlas_client: AtlasClientProtocol, task_id: str):
        self.atlas_client = atlas_client
        self.task_id = task_id
    
    def post_message(self, message: messages.AgentMessage) -> None:
        """Convert toad message to StreamEvent and route appropriately."""
        event = self._to_stream_event(message)
        if event is None:
            return
            
        if event["type"] in STORED_TYPES:
            self.atlas_client.append_context(self.task_id, [event])
        else:
            self.atlas_client.broadcast_event(self.task_id, event)
    
    def _to_stream_event(self, message: messages.AgentMessage) -> dict | None:
        """Convert toad message to StreamEvent dict."""
        import time
        
        event_type = EVENT_TYPE_MAP.get(type(message))
        if event_type is None:
            return None
        
        data = self._extract_data(message)
        return {
            "type": event_type,
            "timestamp": int(time.time() * 1000),
            "data": data,
        }
    
    def _extract_data(self, message: messages.AgentMessage) -> dict:
        """Extract data dict from toad message."""
        if isinstance(message, messages.Update):
            return {"role": "assistant", "content": message.text, "updateType": message.type}
        elif isinstance(message, messages.Thinking):
            return {"text": message.text}
        elif isinstance(message, messages.ToolCall):
            tc = message.tool_call
            return {
                "toolCallId": tc.get("toolCallId"),
                "toolName": tc.get("toolName"),
                "args": tc.get("args"),
            }
        elif isinstance(message, messages.ToolCallUpdate):
            return {
                "toolCallId": message.tool_call.get("toolCallId"),
                "status": message.update.get("status"),
                "output": message.update.get("output"),
            }
        elif isinstance(message, messages.Plan):
            return {"entries": [e for e in message.entries]}
        elif isinstance(message, messages.UpdateStatusLine):
            return {"text": message.status_line}
        elif isinstance(message, messages.RequestPermission):
            return {
                "options": message.options,
                "toolCall": message.tool_call,
            }
        return {}
```

**File: `toad/src/toad/acp/agent.py`** (minimal changes)

```python
# Change line 73 from:
_message_target: MessagePump | None = None

# To:
_message_targets: list[MessagePump] = field(default_factory=list)

# Update post_message (lines 114-125):
def post_message(self, message: AgentMessage) -> None:
    """Post a message to all registered targets."""
    for target in self._message_targets:
        target.post_message(message)

# Add method to register targets:
def add_message_target(self, target: MessagePump) -> None:
    """Register a message target."""
    self._message_targets.append(target)

def remove_message_target(self, target: MessagePump) -> None:
    """Unregister a message target."""
    if target in self._message_targets:
        self._message_targets.remove(target)
```

**Option B: CLI Wrapper (No Toad Changes)**

Keep toad unchanged; CLI intercepts stdout JSON-RPC and translates:

**File: `cli/agents/toad.ts`** (new)

```typescript
import { BaseCLIAgent } from "./base";
import type { StreamHandler, StreamEvent } from "./types";

export class ToadAgent extends BaseCLIAgent {
  name = "toad";
  executable = "toad";
  interactive = true;
  
  buildCommand(task: string): string[] {
    return ["toad", "--headless", "--prompt", task];
  }
  
  createStreamHandler(): StreamHandler {
    return new ToadStreamHandler();
  }
}

class ToadStreamHandler implements StreamHandler {
  private buffer = "";
  
  parse(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    
    // Parse JSON-RPC notifications from toad stdout
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rpc = JSON.parse(line);
        if (rpc.method === "session/update") {
          events.push(this.convertSessionUpdate(rpc.params));
        }
      } catch {}
    }
    return events;
  }
  
  flush(): StreamEvent[] {
    return this.parse("\n");
  }
  
  private convertSessionUpdate(params: any): StreamEvent {
    const { type, content } = params;
    // Map toad session/update types to StreamEvent types
    const typeMap: Record<string, string> = {
      "text": "message",
      "thinking": "thinking",
      "tool_call": "tool_call",
      "tool_result": "tool_update",
    };
    
    return {
      type: typeMap[type] || type,
      timestamp: Date.now(),
      data: content,
    };
  }
}
```

---

## File Changes Summary

### heyatlas/cli
| File | Change Type | Lines |
|------|-------------|-------|
| `tunnel/AtlasTunnel.ts` | Modified | +15 |
| `agents/types.ts` | Modified | +12 |
| `agents/base.ts` | Modified | +8 |
| `agents/toad.ts` | New (Option B) | ~80 |

### heyatlas/atlas
| File | Change Type | Lines |
|------|-------------|-------|
| `src/agent.ts` | Modified | +12 |
| `src/types.ts` | Modified | +8 |

### heyatlas/web
| File | Change Type | Lines |
|------|-------------|-------|
| `src/components/voice/hooks/use-atlas-agent.ts` | Modified | +25 |
| `src/components/voice/task-viewer.tsx` | New | ~100 |
| `src/components/voice/task-event-item.tsx` | New | ~80 |

### toad (Option A only)
| File | Change Type | Lines |
|------|-------------|-------|
| `src/toad/acp/atlas_target.py` | New | ~90 |
| `src/toad/acp/agent.py` | Modified | ~15 |

---

## Testing Plan

### Unit Tests
1. `isStoredEvent()` classification logic
2. `AtlasMessageTarget._to_stream_event()` conversion
3. Event merging in TaskViewer

### Integration Tests
1. CLI → Atlas → Web broadcast flow
2. Task state persistence (stored events survive refresh)
3. Ephemeral events cleared on task completion

### E2E Tests
1. Run toad task, verify tool calls appear in UI
2. Refresh page, verify only messages persist
3. Voice update triggers on completion

---

## Migration Notes

- **Backward Compatible**: Existing tasks with full context continue to work
- **No Data Migration**: New events will be split; old events remain as-is
- **Gradual Rollout**: Can enable per-agent via feature flag

---

## Open Questions

1. **Event TTL**: How long to keep ephemeral events in memory? (Current: 50 per task)
2. **Reconnection**: Should ephemeral events be replayed on WebSocket reconnect?
3. **Permission Handling**: How should `RequestPermission` events work through Atlas?

---

## Next Steps

1. [ ] Implement Phase 1: AtlasTunnel.broadcastTaskEvent()
2. [ ] Implement Phase 2: Atlas agent broadcast_task_event callable
3. [ ] Implement Phase 3: Web UI ephemeral events handling
4. [ ] Implement Phase 4: Choose Option A or B for toad integration
5. [ ] Add tests
6. [ ] Deploy and validate
