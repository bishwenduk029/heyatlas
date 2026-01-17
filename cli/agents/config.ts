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

// All supported agents
export type AgentType = ACPAgentType | "smith";

// Check if agent is smith
export function isSmith(agent: string): agent is "smith" {
  return agent === "smith";
}
