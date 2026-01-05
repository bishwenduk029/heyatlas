/**
 * ACP AI Provider Agent
 *
 * Simplified agent implementation using @mcpc-tech/acp-ai-provider.
 * This replaces the complex ACPAgent class with AI SDK compatible streamText.
 */

import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { streamText } from "ai";

// ACP commands for each agent
const ACP_COMMANDS: Record<string, { command: string; args: string[] }> = {
  opencode: { command: "opencode", args: ["acp"] },
  claude: { command: "claude-code-acp", args: [] },
  goose: { command: "goose", args: ["acp"] },
  gemini: { command: "gemini", args: ["--experimental-acp"] },
  codex: { command: "npx", args: ["@zed-industries/codex-acp"] },
  kimi: { command: "kimi", args: ["--acp"] },
  vibe: { command: "vibe-acp", args: [] },
  auggie: { command: "auggie", args: ["--acp"] },
  stakpak: { command: "stakpak", args: ["acp"] },
  openhands: { command: "openhands", args: ["acp"] },
  cagent: { command: "cagent", args: ["acp"] },
};

export type ACPAgentType = keyof typeof ACP_COMMANDS;

export function isACPAgent(agent: string): agent is ACPAgentType {
  return agent in ACP_COMMANDS;
}

export function getACPCommand(agent: ACPAgentType): string[] {
  const config = ACP_COMMANDS[agent];
  return config ? [config.command, ...config.args] : [];
}

export interface ACPProviderAgentOptions {
  cwd?: string;
}

/**
 * ACPProviderAgent - Simplified agent using acp-ai-provider
 *
 * Provides AI SDK compatible streamText for any ACP agent.
 */
export class ACPProviderAgent {
  private agentType: ACPAgentType;
  private provider: ReturnType<typeof createACPProvider> | null = null;
  private options: ACPProviderAgentOptions;

  constructor(agentType: ACPAgentType, options: ACPProviderAgentOptions = {}) {
    if (!isACPAgent(agentType)) {
      throw new Error(`Unknown ACP agent: ${agentType}`);
    }
    this.agentType = agentType;
    this.options = options;
  }

  get name(): string {
    return this.agentType;
  }

  /**
   * Check if the agent executable is available
   */
  async isAvailable(): Promise<boolean> {
    const config = ACP_COMMANDS[this.agentType];
    if (!config) return false;

    const executable = config.command;

    // Special case for npx
    if (executable === "npx") {
      return true;
    }

    try {
      const { promisify } = await import("node:util");
      const exec = promisify((await import("node:child_process")).exec);
      await exec(`which ${executable}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the ACP provider
   */
  async init(): Promise<void> {
    const config = ACP_COMMANDS[this.agentType];
    if (!config) {
      throw new Error(`Unknown ACP agent: ${this.agentType}`);
    }

    this.provider = createACPProvider({
      command: config.command,
      args: config.args,
      session: {
        cwd: this.options.cwd || process.cwd(),
        mcpServers: [],
      },
      persistSession: true,
    });

    // Pre-initialize session for faster TTFT
    await this.provider.initSession();
  }

  /**
   * Stream a prompt to the agent
   * Returns AI SDK compatible StreamTextResult
   */
  stream(prompt: string) {
    if (!this.provider) {
      throw new Error("Provider not initialized. Call init() first.");
    }

    return streamText({
      model: this.provider.languageModel(),
      prompt,
      tools: this.provider.tools as Parameters<typeof streamText>[0]["tools"],
      includeRawChunks: true,
    });
  }

  /**
   * Clean up the provider
   */
  cleanup(): void {
    if (this.provider) {
      this.provider.cleanup();
      this.provider = null;
    }
  }
}
