export type AgentType =
  | "claude"
  | "codex"
  | "crush"
  | "droid"
  | "gemini"
  | "goose"
  | "opencode";

export interface AgentConfig {
  executable: string;
  buildArgs: (task: string) => string[];
  taskHandlingPrompt?: string;
}

export const TASK_MANAGER_PROMPT = `
IMPORTANT: Always use the task-manager MCP tool to:
1. Check if this is a new task or continuation (use list_tasks first)
2. Track task progress with execute_task/verify_task
3. Provide output in this format:
   - Task: <description>
   - Task ID: <id from task-manager>
   - Status: completed | needs_input | error
   - Details: <what was done or what's needed>
`;

export const DEFAULT_TASK_HANDLING_PROMPT = TASK_MANAGER_PROMPT;

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  opencode: {
    executable: "opencode",
    buildArgs: (task) => ["opencode", "-p", task],
  },
  droid: {
    executable: "droid",
    buildArgs: (task) => ["droid", "-p", task],
  },
  claude: {
    executable: "claude",
    buildArgs: (task) => ["claude", "-p", task, "--output-format", "text", "--verbose"],
  },
  gemini: {
    executable: "gemini",
    buildArgs: (task) => ["gemini", "-p", task],
  },
  codex: {
    executable: "codex",
    buildArgs: (task) => ["codex", task],
  },
  goose: {
    executable: "goose",
    buildArgs: (task) => ["goose", "run", "--text", task],
  },
  crush: {
    executable: "crush",
    buildArgs: (task) => ["crush", "-m", task],
  },
};

export function getAgentConfig(agentName: string): AgentConfig {
  const config = AGENT_CONFIGS[agentName as AgentType];
  if (!config) {
    // Fallback for unknown agents
    return {
      executable: agentName,
      buildArgs: (task) => [agentName, "-p", task],
    };
  }
  return config;
}

export function buildTaskWithPrompt(
  task: string,
  agentName: string,
  customPrompt?: string
): string {
  const config = getAgentConfig(agentName);
  const prompt = customPrompt ?? config.taskHandlingPrompt ?? DEFAULT_TASK_HANDLING_PROMPT;
  return `${task}\n\n${prompt}`;
}
