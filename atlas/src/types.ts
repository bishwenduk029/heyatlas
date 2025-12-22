import type { AgentNamespace } from "agents";
import type { AtlasAgent } from "./agent";
import type { Tier } from "./prompts";

export interface Env {
  "atlas-agent": AgentNamespace<AtlasAgent>;
  AUTH_API_BASE: string;
  NIRMANUS_API_KEY: string;
  HEYATLAS_PROVIDER_API_KEY: string;
  HEYATLAS_PROVIDER_API_URL: string;
  LLM_MODEL: string;
  MEM0_API_KEY?: string;
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
  // Internal history for custom API methods (chat, chatCompletions)
  history: Array<{ role: "user" | "assistant"; content: string }>;
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
