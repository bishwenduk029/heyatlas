import type { AgentNamespace } from "agents";

import type { AtlasAgent } from "./agent";
import type { Tier } from "./prompts";

export interface Env {
  "atlas-agent": AgentNamespace<AtlasAgent>;
  AUTH_API_BASE: string;
  NIRMANUS_API_KEY: string;
  HEYATLAS_PROVIDER_API_URL: string;
  HEYATLAS_PROVIDER_API_KEY?: string;
  LLM_MODEL: string;
LLM_CHAT_MODEL?: string;
  AI_GATEWAY_API_KEY: string;
  PARALLELS_WEB_SEARCH_API?: string;
  PARALLELS_WEB_SEARCH_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  E2B_API_KEY?: string;
  ATLAS_CALLBACK_URL?: string;
  PARALLEL_API_KEY: string;
  // For sandbox to connect back to Atlas
  ATLAS_AGENT_HOST?: string;

  // R2 bucket for file uploads
  ATLAS_UPLOADS: R2Bucket;
  ATLAS_UPLOADS_PUBLIC_URL: string;
  // Workers AI binding for markdown conversion and AI models
  AI: Ai;
}

export interface TaskUpdate {
  content: string;
  source: string;
  agent: string;
  status: string;
  timestamp: number;
}

export interface SyncedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Agent connected to Atlas via CLI tunnel */
export interface ConnectedAgent {
  id: string;              // "smith", "opencode", "amp"
  type: "local" | "sandbox";
  connectedAt: number;
  capabilities?: string[]; // ["coding", "browser", "computer-use"]
}

export interface AgentState {
  credentials: UserCredentials | null;
  tier: Tier;
  persona: string | null;
  tokensUsed: number;
  personaUpdatedAt: number | null;
  sandbox: SandboxMetadata | null;
  /** Mini computer - cloud sandbox with browser & agent-smith tools */
  miniComputer: MiniComputerMetadata | null;
  tasks: Record<string, Task>;
  /** Connected agents (multiple can be connected simultaneously) */
  agents: ConnectedAgent[];
  /** @deprecated Use agents array instead */
  activeAgent: string | null;
  interactiveMode: boolean;
  interactiveTaskId: string | null;
  systemPrompt: string | null;
  /** Version of cached systemPrompt - bumped to force refresh */
  promptVersion: number;
  userSection: string | null;
  compressing: boolean;
  /** Cumulative input tokens from the last API response (tracks context size) */
  lastInputTokens: number;
  /** Stable facts about the user: name, relationships, job, family, etc. */
  userDetails: string[];
  /** User preferences and instructions: style, behavior directives */
  userPreferences: string[];
}

export interface MiniComputerMetadata {
  active: boolean;
  sandboxId?: string;
  vncUrl?: string;
}

export interface Task {
  id: string;
  /** @deprecated Use assignedAgent instead */
  agentId?: string;
  /** Agent assigned to handle this task */
  assignedAgent?: string;
  description: string; // Brief description of the task for listing
  // Task lifecycle:
  // - new: Fresh task, CLI should pick up and execute
  // - continue: Existing task with new input, CLI should continue execution
  // - in-progress: CLI is currently executing
  // - pending-user-feedback: Completed, waiting for user response
  // - completed: Task fully done
  // - failed: Task failed
  // - paused: Task paused by user
  state:
    | "new"
    | "continue"
    | "in-progress"
    | "pending-user-feedback"
    | "completed"
    | "failed"
    | "paused";
  context: any[];
  result?: string;
  summary?: string; // Brief summary for voice feedback
  createdAt: number;
  updatedAt: number;
}

export interface SandboxMetadata {
  type: string; // Provider type (e.g., "e2b")
  sandboxId: string;
  vncUrl?: string;
  computerAgentUrl?: string;
  agentConnected?: boolean;
}

export type SelectedAgent =
  | { type: "local" }
  | { type: "cloud"; agentId: string };

export interface UserCredentials {
  userId: string;
  email?: string;
  providerApiKey: string;
  providerApiUrl: string;
  atlasAccessToken?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  parts?: Array<{
    type: "text" | "file";
    text?: string;
    data?: string;
    mediaType?: string;
    filename?: string;
  }>;
}

export interface FileAttachment {
  id: string;
  type: "file";
  url: string;
  mediaType: string;
  filename: string;
}

export interface AgentMessage {
  type: "chat" | "stream" | "clear_history" | "task-update";
  content?: string;
  messageId?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/** Event from CLI agents streamed via AtlasTunnel */
export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Broadcast message for ephemeral task events */
export interface TaskEventBroadcast {
  type: "task_event";
  taskId: string;
  event: StreamEvent;
  timestamp: number;
}
