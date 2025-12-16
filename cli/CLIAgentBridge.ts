/**
 * CLIAgentBridge - Consumer class that bridges remote tunnel to local CLI agents.
 *
 * Uses RemoteTunnel SDK to connect to relay rooms and executes tasks
 * using local CLI agents (opencode, droid, claude, goose, etc.)
 */

import { RemoteTunnel, type RemoteTunnelOptions } from "./tunnel";
import {
  createAgent,
  getAvailableAgents,
  type AgentType,
  AgentError,
  buildTaskWithPrompt,
} from "./agents";

export interface CLIAgentBridgeOptions extends RemoteTunnelOptions {
  agentId?: string;
  defaultAgent?: AgentType;
  onLog?: (message: string) => void;
}

const SUPPORTED_AGENTS: AgentType[] = [
  "opencode",
  "droid",
  "gemini",
  "codex",
  "claude",
  "goose",
  "crush",
];

export class CLIAgentBridge {
  private tunnel: RemoteTunnel;
  private agentId: string;
  private selectedAgent: AgentType;
  private onLog: (message: string) => void;

  constructor(options: CLIAgentBridgeOptions = {}) {
    this.tunnel = new RemoteTunnel(options);
    this.agentId = options.agentId || "on-device-computer";
    this.selectedAgent = options.defaultAgent || "opencode";
    this.onLog = options.onLog || (() => {});

    // Subscribe to incoming messages
    this.tunnel.sub(this.handleMessage.bind(this));
  }

  /**
   * Connect to a relay room by room ID.
   */
  async connect(roomId: string): Promise<void> {
    this.onLog(`Connecting to room: ${roomId}`);
    await this.tunnel.connectToRoom(roomId, {
      agentId: this.agentId,
      role: "computer",
    });
  }

  /**
   * Disconnect from the tunnel.
   */
  async disconnect(): Promise<void> {
    await this.tunnel.disconnect();
  }

  /**
   * Set the CLI agent to use for task execution.
   */
  setAgent(agent: AgentType): void {
    if (!SUPPORTED_AGENTS.includes(agent)) {
      throw new Error(`Unsupported agent: ${agent}. Supported: ${SUPPORTED_AGENTS.join(", ")}`);
    }
    this.selectedAgent = agent;
    console.log(`🤖 Selected agent: ${agent}`);
  }

  /**
   * Get connection status.
   */
  get isConnected(): boolean {
    return this.tunnel.isConnected;
  }

  /**
   * Get current room.
   */
  get room(): string | null {
    return this.tunnel.room;
  }

  /**
   * Get currently selected agent.
   */
  get agent(): AgentType {
    return this.selectedAgent;
  }

  /**
   * Get list of supported agents.
   */
  get supportedAgents(): AgentType[] {
    return SUPPORTED_AGENTS;
  }

  /**
   * Get list of available (installed) agents.
   */
  async getAvailableAgents(): Promise<AgentType[]> {
    return getAvailableAgents();
  }

  /**
   * Callback handler for incoming messages from the relay room.
   */
  private async handleMessage(
    content: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (data?.type !== "tasks") return;

    const taskText = content;
    console.error(`📥 Task received: ${taskText.substring(0, 50)}...`);
    console.error(`🤖 Using agent: ${this.selectedAgent}`);
    this.onLog(`Task received, executing with ${this.selectedAgent}`);

    try {
      const result = await this.executeTask(taskText);
      console.error(`📤 Sending response (${result.length} chars)...`);
      const sent = await this.tunnel.publish({
        type: "task-response",
        result: result,
        agent: this.selectedAgent,
        agent_id: this.agentId,
      });
      console.error(`✅ Task completed, response sent: ${sent}`);
      this.onLog(`Task completed`);
    } catch (error) {
      console.error("❌ Task failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.onLog(`Task failed: ${errorMsg}`);
      await this.tunnel.publish({
        type: "task-response",
        status: "error",
        error: errorMsg,
        agent: this.selectedAgent,
        agent_id: this.agentId,
      });
    }
  }

  /**
   * Execute a task using the selected CLI agent.
   */
  private async executeTask(taskText: string): Promise<string> {
    console.error(`🚀 Executing task with agent: ${this.selectedAgent}`);
    this.onLog(`Executing with ${this.selectedAgent}`);

    const fullTask = buildTaskWithPrompt(taskText, this.selectedAgent);
    const agent = createAgent(this.selectedAgent);

    const available = await agent.isAvailable();
    if (!available) {
      throw new Error(`Agent '${this.selectedAgent}' is not installed or not in PATH`);
    }

    try {
      const result = await (agent as any).run(fullTask, {});
      return result.stdout || "Task completed";
    } catch (error) {
      if (error instanceof AgentError) {
        console.error(`❌ Agent error: ${error.message}`);
        this.onLog(`Agent error: ${error.message}`);
      }
      throw error;
    }
  }
}
