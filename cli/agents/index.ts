export * from "./types";
export * from "./base";
export * from "./config";
export { ptyManager, type OutputCallback } from "./pty-manager";
export { ClaudeAgent } from "./claude";
export { CodexAgent } from "./codex";
export { DroidAgent } from "./droid";
export { GeminiAgent } from "./gemini";
export { GooseAgent } from "./goose";
export { OpencodeAgent } from "./opencode";
export { CrushAgent } from "./crush";

import type { CLIAgent } from "./types";
import type { AgentType } from "./config";
import { ClaudeAgent } from "./claude";
import { CodexAgent } from "./codex";
import { DroidAgent } from "./droid";
import { GeminiAgent } from "./gemini";
import { GooseAgent } from "./goose";
import { OpencodeAgent } from "./opencode";
import { CrushAgent } from "./crush";

const agentRegistry: Record<AgentType, () => CLIAgent> = {
  claude: () => new ClaudeAgent(),
  codex: () => new CodexAgent(),
  crush: () => new CrushAgent(),
  droid: () => new DroidAgent(),
  gemini: () => new GeminiAgent(),
  goose: () => new GooseAgent(),
  opencode: () => new OpencodeAgent(),
};

export function createAgent(type: AgentType): CLIAgent {
  const factory = agentRegistry[type];
  if (!factory) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return factory();
}

export function getAllAgentTypes(): AgentType[] {
  return Object.keys(agentRegistry) as AgentType[];
}

export async function getAvailableAgents(): Promise<AgentType[]> {
  const available: AgentType[] = [];
  for (const type of getAllAgentTypes()) {
    const agent = createAgent(type);
    if (await agent.isAvailable()) {
      available.push(type);
    }
  }
  return available;
}
