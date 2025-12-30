/**
 * ACP (Agent Client Protocol) Agent
 * 
 * A unified agent implementation using the official ACP SDK.
 * This provides a consistent interface for all ACP-compatible agents
 * (opencode, claude, goose, gemini, codex, etc.)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { StreamEvent, StreamEventType } from "./types";

// ACP commands for each agent (from toad's agent configs)
const ACP_COMMANDS: Record<string, string[]> = {
  opencode: ["opencode", "acp"],
  claude: ["claude-code-acp"],
  goose: ["goose", "acp"],
  gemini: ["gemini", "--experimental-acp"],
  codex: ["npx", "@zed-industries/codex-acp"],
  kimi: ["kimi", "--acp"],
  vibe: ["vibe-acp"],
  auggie: ["auggie", "--acp"],
  stakpak: ["stakpak", "acp"],
  openhands: ["openhands", "acp"],
  cagent: ["cagent", "acp"],
};

export type ACPAgentType = keyof typeof ACP_COMMANDS;

export function isACPAgent(agent: string): agent is ACPAgentType {
  return agent in ACP_COMMANDS;
}

export function getACPCommand(agent: ACPAgentType): string[] {
  return ACP_COMMANDS[agent] || [];
}

/**
 * Event callback for streaming events
 */
export type ACPEventCallback = (event: StreamEvent) => void | Promise<void>;

/**
 * Options for running ACP agent
 */
export interface ACPRunOptions {
  cwd?: string;
  onEvent?: ACPEventCallback;
  onComplete?: (stopReason: string) => void;
  onError?: (error: Error) => void;
}

/**
 * ACP Client implementation that handles agent events
 */
class ACPClientHandler implements acp.Client {
  private onEvent: ACPEventCallback;
  private sessionId: string | null = null;

  constructor(onEvent: ACPEventCallback) {
    this.onEvent = onEvent;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    // Emit permission request event
    await this.onEvent({
      type: "permission",
      data: {
        toolCallId: params.toolCall.toolCallId,
        title: params.toolCall.title,
        options: params.options.map((opt) => ({
          id: opt.optionId,
          name: opt.name,
          kind: opt.kind,
        })),
      },
    });

    // Auto-approve for now (TODO: implement interactive permission)
    // Find the "allow_once" or first "allow" option
    const allowOption = params.options.find(
      (opt) => opt.kind === "allow_once" || opt.kind === "allow_always"
    );
    
    if (allowOption) {
      return {
        outcome: {
          outcome: "selected",
          optionId: allowOption.optionId,
        },
      };
    }

    // If no allow option, deny
    return {
      outcome: {
        outcome: "selected",
        optionId: params.options[0]?.optionId || "",
      },
    };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          await this.onEvent({
            type: "message",
            data: {
              role: "assistant",
              content: update.content.text,
              delta: true,
            },
          });
        }
        break;

      case "tool_call":
        await this.onEvent({
          type: "tool_call",
          data: {
            id: update.toolCallId,
            name: update.title,
            status: update.status,
            kind: update.kind,
          },
        });
        break;

      case "tool_call_update":
        await this.onEvent({
          type: "tool_update",
          data: {
            id: update.toolCallId,
            status: update.status,
            content: update.content,
          },
        });
        break;

      case "plan":
        await this.onEvent({
          type: "plan",
          data: {
            entries: update.entries,
          },
        });
        break;

      case "agent_thought_chunk":
        await this.onEvent({
          type: "thinking",
          data: {
            content: update.content,
          },
        });
        break;

      case "user_message_chunk":
        await this.onEvent({
          type: "message",
          data: {
            role: "user",
            content:
              update.content.type === "text" ? update.content.text : "[media]",
            delta: true,
          },
        });
        break;

      default:
        // Log unknown update types for debugging
        await this.onEvent({
          type: "status",
          data: {
            status: "update",
            message: `Unknown update: ${(update as any).sessionUpdate}`,
          },
        });
    }
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest
  ): Promise<acp.WriteTextFileResponse> {
    await this.onEvent({
      type: "tool_call",
      data: {
        id: `write-${Date.now()}`,
        name: "writeFile",
        status: "completed",
        kind: "file_write",
        args: { path: params.path },
      },
    });
    return {};
  }

  async readTextFile(
    params: acp.ReadTextFileRequest
  ): Promise<acp.ReadTextFileResponse> {
    await this.onEvent({
      type: "tool_call",
      data: {
        id: `read-${Date.now()}`,
        name: "readFile",
        status: "completed",
        kind: "file_read",
        args: { path: params.path },
      },
    });

    // Read the actual file
    try {
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(params.path, "utf-8");
      return { content };
    } catch (error) {
      return { content: "" };
    }
  }
}

/**
 * ACPAgent - Unified agent using ACP protocol
 */
export class ACPAgent {
  private agentType: ACPAgentType;
  private process: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private clientHandler: ACPClientHandler | null = null;

  constructor(agentType: ACPAgentType) {
    if (!isACPAgent(agentType)) {
      throw new Error(`Unknown ACP agent: ${agentType}`);
    }
    this.agentType = agentType;
  }

  get name(): string {
    return this.agentType;
  }

  /**
   * Check if the agent executable is available
   */
  async isAvailable(): Promise<boolean> {
    const command = ACP_COMMANDS[this.agentType];
    if (!command || command.length === 0) return false;

    const executable = command[0];

    // Special case for npx
    if (executable === "npx") {
      return true; // Assume npx is available
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
   * Start the agent process and establish ACP connection
   */
  async start(options: ACPRunOptions = {}): Promise<void> {
    const command = ACP_COMMANDS[this.agentType];
    const [executable, ...args] = command;

    // Spawn the agent process

    
    this.process = spawn(executable, args, {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"], // Capture stderr too
      env: {
        ...process.env,
        // Some agents need these
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    });

    // Log stderr for debugging
    this.process.stderr?.on("data", (data) => {
      console.error(`[ACP stderr] ${data.toString().trim()}`);
    });

    // Create streams for ACP communication
    const input = Writable.toWeb(this.process.stdin!);
    const output = Readable.toWeb(
      this.process.stdout!
    ) as ReadableStream<Uint8Array>;

    // Create client handler
    this.clientHandler = new ACPClientHandler(
      options.onEvent || (() => {})
    );

    // Create ACP connection
    const stream = acp.ndJsonStream(input, output);
    this.connection = new acp.ClientSideConnection(
      () => this.clientHandler!,
      stream
    );

    // Handle process exit
    this.process.on("exit", (code) => {
      if (options.onComplete) {
        options.onComplete(code === 0 ? "end_turn" : "error");
      }
    });

    this.process.on("error", (error) => {
      if (options.onError) {
        options.onError(error);
      }
    });

    // Initialize connection
    try {
      const initResult = await this.connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      });

      await options.onEvent?.({
        type: "status",
        data: {
          status: "connected",
          message: `Connected to ${this.agentType} (protocol v${initResult.protocolVersion})`,
        },
      });
    } catch (error) {
      throw new Error(`Failed to initialize ACP connection: ${error}`);
    }
  }

  /**
   * Create a new session
   */
  async createSession(cwd?: string): Promise<string> {
    if (!this.connection) {
      throw new Error("Agent not started. Call start() first.");
    }

    const result = await this.connection.newSession({
      cwd: cwd || process.cwd(),
      mcpServers: [],
    });

    this.sessionId = result.sessionId;
    this.clientHandler?.setSessionId(result.sessionId);

    return result.sessionId;
  }

  /**
   * Send a prompt to the agent
   */
  async prompt(message: string): Promise<string> {
    if (!this.connection || !this.sessionId) {
      throw new Error("No active session. Call createSession() first.");
    }

    try {
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: [
          {
            type: "text",
            text: message,
          },
        ],
      });

      return result.stopReason;
    } catch (error) {
      console.error(`[ACP] Prompt error:`, error);
      throw error;
    }
  }

  /**
   * Cancel the current operation
   */
  async cancel(): Promise<void> {
    if (!this.connection || !this.sessionId) return;

    await this.connection.cancel({
      sessionId: this.sessionId,
    });
  }

  /**
   * Stop the agent and clean up
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connection = null;
    this.sessionId = null;
    this.clientHandler = null;
  }

  /**
   * Run a single prompt (convenience method)
   */
  async run(
    message: string,
    options: ACPRunOptions = {}
  ): Promise<string> {
    try {
      await this.start(options);
      await this.createSession(options.cwd);
      const stopReason = await this.prompt(message);
      return stopReason;
    } finally {
      await this.stop();
    }
  }
}
