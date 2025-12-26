import type { AgentNamespace } from "agents";
import type { AtlasAgent } from "./agent";
import type { Tier } from "./prompts";

export interface Env {
  "atlas-agent": AgentNamespace<AtlasAgent>;
  AUTH_API_BASE: string;
  NIRMANUS_API_KEY: string;
  HEYATLAS_PROVIDER_API_URL: string;
  LLM_MODEL: string;
  PARALLELS_WEB_SEARCH_API?: string;
  PARALLELS_WEB_SEARCH_API_KEY?: string;
  E2B_API_KEY?: string;
  ATLAS_CALLBACK_URL?: string;
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

export interface AgentState {
  credentials: UserCredentials | null;
  tier: Tier;
  persona: string | null;
  personaUpdatedAt: number | null;
  sandbox: SandboxState | null;
  tasks: Record<string, Task>;
  connectedAgentId: string | null;
  interactiveMode: boolean;
  interactiveTaskId: string | null;
}

export interface Task {
  id: string;
  agentId?: string;
  description: string; // Brief description of the task for listing
  // Task lifecycle:
  // - new: Fresh task, CLI should pick up and execute
  // - continue: Existing task with new input, CLI should continue execution
  // - in-progress: CLI is currently executing
  // - pending-user-feedback: Completed, waiting for user response
  // - completed: Task fully done
  // - failed: Task failed
  // - paused: Task paused by user
  state: "new" | "continue" | "in-progress" | "pending-user-feedback" | "completed" | "failed" | "paused";
  context: any[];
  result?: string;
  summary?: string; // Brief summary for voice feedback
  createdAt: number;
  updatedAt: number;
}

export interface SandboxState {
  sandboxId: string;
  vncUrl: string;
  computerAgentUrl: string;
  logsUrl: string;
  sandboxCallbackToken: string;
}

export interface UserCredentials {
  userId: string;
  email?: string;
  providerApiKey: string;
  providerApiUrl: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
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
