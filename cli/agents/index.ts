export * from "./types";
export * from "./base";
export * from "./config";
export { ptyManager, type OutputCallback } from "./pty-manager";
export { ClaudeAgent } from "./claude";
export { DroidAgent } from "./droid";
export { OpencodeAgent } from "./opencode";
export { ToadAgent } from "./toad";
export { ACPAgent, isACPAgent, getACPCommand, type ACPAgentType, type ACPEventCallback, type ACPRunOptions } from "./acp";

import type { CLIAgent } from "./types";
import type { AgentType } from "./config";
import { ClaudeAgent } from "./claude";
import { DroidAgent } from "./droid";
import { OpencodeAgent } from "./opencode";
import { ToadAgent } from "./toad";

const agentRegistry: Record<AgentType, () => CLIAgent> = {
  claude: () => new ClaudeAgent(),
  droid: () => new DroidAgent(),
  opencode: () => new OpencodeAgent(),
  toad: () => new ToadAgent(),
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
