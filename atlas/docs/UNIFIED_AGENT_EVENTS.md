# Unified Agent Event Rendering Architecture

## Overview

This document describes the architecture for rendering events from any ACP-compatible coding agent (OpenCode, Goose, Claude Code, etc.) in the Atlas UI.

## Current State Analysis

### Data Flow
```
ACPProviderAgent (streamText) → AtlasTunnel (broadcast_task_event) → AtlasAgent (WebSocket) → Frontend (useAtlasAgent)
```

### Current Limitations

1. **Raw ACP events passed directly** - No normalization between agents
2. **Diff detection missing** - Tool outputs rendered as JSON, not as visual diffs
3. **Agent-specific formats** - OpenCode has `metadata.diff`, Goose has `[{content: {text}}]`
4. **No action type classification** - Can't distinguish file_edit from command_run

## Design: Inspired by Vibe-Kanban

### Key Learnings from Vibe-Kanban

1. **NormalizedEntry schema** - All agents normalize to a common format
2. **ActionType taxonomy** - Classify operations: `file_edit`, `command_run`, `file_read`, etc.
3. **FileChange structure** - `{action: "edit", unified_diff, has_line_numbers}`
4. **Diff utilities** - Extract and normalize unified diffs from various formats
5. **Frontend routing** - `DisplayConversationEntry` routes by `ActionType`

## Proposed Schema

### NormalizedEntry (CLI → Atlas)

```typescript
interface NormalizedEntry {
  timestamp: number;
  entryType: NormalizedEntryType;
  content: string;
  metadata?: Record<string, unknown>;
}

type NormalizedEntryType =
  | { type: "user_message" }
  | { type: "assistant_message" }
  | { type: "thinking" }
  | { type: "tool_use"; toolName: string; actionType: ActionType; status: ToolStatus }
  | { type: "error_message"; errorType: string };

type ActionType =
  | { action: "file_read"; path: string }
  | { action: "file_edit"; path: string; changes: FileChange[] }
  | { action: "command_run"; command: string; result?: CommandResult }
  | { action: "search"; query: string }
  | { action: "web_fetch"; url: string }
  | { action: "tool"; toolName: string; input?: unknown; output?: unknown };

type FileChange =
  | { action: "write"; content: string }
  | { action: "delete" }
  | { action: "rename"; newPath: string }
  | { action: "edit"; unifiedDiff: string; hasLineNumbers: boolean };

type ToolStatus =
  | { status: "created" }
  | { status: "running" }
  | { status: "success" }
  | { status: "failed" }
  | { status: "pending_approval"; approvalId: string }
  | { status: "denied"; reason?: string };
```

### Agent-Specific Normalization

#### OpenCode
```typescript
// Input: { output: "", metadata: { diff, filediff } }
// Output: ActionType = { action: "file_edit", path, changes: [{ action: "edit", unifiedDiff }] }
```

#### Goose
```typescript
// Input: [{ content: { text: "..." } }]
// Output: ActionType = { action: "tool", toolName, output: text }
// Note: No diff available - fallback to text rendering
```

#### Claude Code
```typescript
// Input: stream-json with tool calls
// Output: Extract diff from permission metadata, similar to OpenCode
```

## Implementation Plan

### Phase 1: Event Normalization Layer (CLI)

**Files to create:**
- `cli/agents/normalize.ts` - Core normalization utilities
- `cli/agents/normalizers/opencode.ts` - OpenCode-specific
- `cli/agents/normalizers/goose.ts` - Goose-specific
- `cli/agents/normalizers/claude-code.ts` - Claude Code-specific

**Key functions:**
```typescript
// cli/agents/normalize.ts
export function normalizeToolOutput(
  agentType: ACPAgentType,
  toolName: string,
  input: unknown,
  output: unknown
): ActionType;

export function extractUnifiedDiff(output: unknown): string | null;
export function detectDiffFormat(text: string): "unified" | "filediff" | null;
export function parseUnifiedDiff(diff: string): ParsedHunk[];
```

### Phase 2: Diff Utilities (Shared)

**Files to create:**
- `cli/lib/diff.ts` or `shared/diff.ts` - Diff parsing utilities

**Functions:**
```typescript
export function extractUnifiedDiffHunks(diff: string): string[];
export function normalizeUnifiedDiff(path: string, diff: string): string;
export function isUnifiedDiff(text: string): boolean;
```

### Phase 3: Frontend Rendering Components

**Files to modify/create:**
- `web/src/components/ai-elements/diff-renderer.tsx` - New component
- `web/src/components/ai-elements/tool.tsx` - Enhance ToolOutput
- `web/src/components/voice/task-artifact.tsx` - Route to DiffRenderer

**DiffRenderer component:**
```tsx
interface DiffRendererProps {
  path: string;
  unifiedDiff: string;
  hasLineNumbers: boolean;
  defaultExpanded?: boolean;
}

// Uses @git-diff-view/react or similar for visualization
```

### Phase 4: Enhanced Task Artifact

Modify `task-artifact.tsx` to:
1. Detect ActionType from normalized events
2. Route `file_edit` actions to DiffRenderer
3. Show file path header with +/- line counts
4. Collapsible view for large diffs

## WebSocket Protocol

No changes needed to `agent.ts` - existing `broadcast_task_event` works:

```typescript
// CLI broadcasts normalized events
await tunnel.broadcastTaskEvent(taskId, {
  type: "ui_stream_chunk",
  timestamp: Date.now(),
  data: {
    type: "tool-output-available",
    toolCallId,
    toolName,
    output: normalizedOutput, // Now includes ActionType
  }
});
```

## Migration Strategy

1. **Backward compatible** - New fields are optional
2. **Gradual rollout** - Enable per-agent as normalizers are ready
3. **Fallback rendering** - If no diff detected, show JSON as today

## Package Dependencies

**Frontend (web/):**
```json
{
  "@git-diff-view/react": "^0.15.0",
  "@git-diff-view/shiki": "^0.15.0"
}
```

**Alternative:** `@pierre/diffs` for simpler integration

## File Structure After Implementation

```
cli/
├── agents/
│   ├── acp-provider.ts
│   ├── normalize.ts           # Core normalization
│   ├── normalizers/
│   │   ├── opencode.ts
│   │   ├── goose.ts
│   │   └── claude-code.ts
│   └── types.ts               # Add NormalizedEntry types
├── lib/
│   └── diff.ts                # Diff utilities
└── tunnel/
    └── AtlasTunnel.ts         # No changes needed

web/src/components/
├── ai-elements/
│   ├── diff-renderer.tsx      # New: Diff visualization
│   ├── file-change.tsx        # New: Route by FileChange type
│   └── tool.tsx               # Enhanced ToolOutput
└── voice/
    └── task-artifact.tsx      # Route to DiffRenderer
```

## Testing Strategy

1. **Unit tests** for normalizers with sample agent outputs
2. **Snapshot tests** for DiffRenderer with various diff formats
3. **Integration tests** with mock WebSocket events
4. **Manual testing** with OpenCode, Goose, Claude Code

## Open Questions

1. Should we store normalized events in task.context or keep ephemeral?
2. Do we need approval UI for tool calls (like vibe-kanban)?
3. Should diff rendering support split view toggle?
