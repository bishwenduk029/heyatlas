// ACP-compatible agents
export type ACPAgentType =
  | "opencode"
  | "claude-code"
  | "goose"
  | "gemini-code"
  | "codex"
  | "kimi"
  | "vibe"
  | "auggie"
  | "stakpak"
  | "openhands"
  | "cagent";

// HTTP-based agents (non-ACP)
export type HTTPAgentType = "agent-smith-py";

// All supported agents
export type AgentType = ACPAgentType | HTTPAgentType;

// Check if agent uses HTTP protocol
export function isHTTPAgent(agent: string): agent is HTTPAgentType {
  return agent === "agent-smith-py";
}
