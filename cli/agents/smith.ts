/**
 * Smith Agent
 *
 * Handles communication with smith (AI SDK compatible multi-agent).
 * Uses /agents/:id/chat endpoint for streaming.
 */

import { spawn, type ChildProcess } from "child_process";

const SMITH_CONFIG = {
  port: 3030,
  agentId: "workflow-orchestrator",
  healthPath: "/health",
  chatPath: "/agents/workflow-orchestrator/chat",
  command: "npx",
  args: ["tsx", "src/index.ts"],
  cwd: "smith",
};

export interface SmithOptions {
  cwd?: string;
}

/**
 * Smith - AI SDK compatible multi-agent
 */
export class Smith {
  private options: SmithOptions;
  private baseUrl: string;
  private process: ChildProcess | null = null;

  constructor(options: SmithOptions = {}) {
    this.options = options;
    this.baseUrl = `http://localhost:${SMITH_CONFIG.port}`;
  }

  get name(): string {
    return "smith";
  }

  get agentId(): string {
    return SMITH_CONFIG.agentId;
  }

  get port(): number {
    return SMITH_CONFIG.port;
  }

  /**
   * Check if smith is already running
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${SMITH_CONFIG.healthPath}`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if dependencies are available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { promisify } = await import("node:util");
      const exec = promisify((await import("node:child_process")).exec);
      await exec("which npx || where npx");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start smith server
   */
  async start(): Promise<void> {
    if (await this.isRunning()) {
      console.log(`[smith] Server already running on port ${SMITH_CONFIG.port}`);
      return;
    }

    const cwd = `${this.options.cwd || process.cwd()}/${SMITH_CONFIG.cwd}`;

    const env = {
      ...process.env,
      PORT: String(SMITH_CONFIG.port),
    };

    this.process = spawn(SMITH_CONFIG.command, SMITH_CONFIG.args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data) => {
      console.log(`[smith] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data) => {
      console.error(`[smith] ${data.toString().trim()}`);
    });

    this.process.on("error", (err) => {
      console.error(`[smith] Process error:`, err.message);
    });

    await this.waitForReady();
  }

  private async waitForReady(maxAttempts = 60): Promise<void> {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isRunning()) {
        return;
      }
      await delay(1000);
    }

    throw new Error(`Smith failed to start after ${maxAttempts}s`);
  }

  /**
   * Stop smith server
   */
  stop(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  /**
   * Stream a chat request to smith
   */
  async *streamChat(prompt: string): AsyncGenerator<SmithStreamPart> {
    const response = await fetch(`${this.baseUrl}${SMITH_CONFIG.chatPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let jsonStr: string | null = null;

        if (trimmed.startsWith("data: ")) {
          jsonStr = trimmed.slice(6);
        } else if (/^\d+:/.test(trimmed)) {
          const colonIndex = trimmed.indexOf(":");
          jsonStr = trimmed.slice(colonIndex + 1);
        }

        if (jsonStr && jsonStr !== "[DONE]") {
          try {
            const event = JSON.parse(jsonStr) as SmithStreamPart;
            yield event;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }
}

export interface SmithStreamPart {
  type: string;
  delta?: string;
  text?: string;
  id?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  subAgentId?: string;
  subAgentName?: string;
  [key: string]: unknown;
}
