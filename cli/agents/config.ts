export type AgentType =
  | "claude"
  | "codex"
  | "crush"
  | "droid"
  | "gemini"
  | "goose"
  | "opencode"
  | "toad";

export interface AgentConfig {
  executable: string;
  buildArgs: (task: string) => string[];
  taskHandlingPrompt?: string;
}

export const TASK_MANAGER_PROMPT = `
IMPORTANT: You are working as a sub-agent.
Your output MUST be valid JSON only, conforming to this structure:
{
  "state": "completed" | "failed" | "in-progress",
  "result": "Description of what was done",
  "context": ["Log 1", "Log 2"]
}

Do not include any markdown formatting (like \`\`\`json) or extra text outside the JSON object.
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
  toad: {
    executable: "toad",
    buildArgs: (task) => ["toad", "--headless", "--prompt", task],
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
