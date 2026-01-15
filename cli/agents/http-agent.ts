/**
 * HTTP Agent Provider
 *
 * Handles communication with HTTP-based agents like agent-smith-py.
 * These agents run as servers and accept tasks via HTTP POST.
 */

import { spawn, type ChildProcess } from "child_process";
import type { HTTPAgentType } from "./config";

// Agent configurations
const HTTP_AGENT_CONFIG: Record<HTTPAgentType, {
  command: string;
  args: string[];
  port: number;
  healthPath: string;
  taskPath: string;
  streamPath: string;
  cwd?: string;
}> = {
  "agent-smith-py": {
    command: "uv",
    args: ["run", "python", "main.py"],
    port: 3141,
    healthPath: "/health",
    taskPath: "/agents/agent-smith/text",
    streamPath: "/agents/agent-smith/stream",
    cwd: "desktop-sandbox/agent-smith-py",
  },
};

export interface HTTPAgentOptions {
  cwd?: string;
  timeout?: number;
}

/**
 * HTTPAgent - Manages HTTP-based agents
 */
export class HTTPAgent {
  private agentType: HTTPAgentType;
  private options: HTTPAgentOptions;
  private process: ChildProcess | null = null;
  private baseUrl: string;
  private config: typeof HTTP_AGENT_CONFIG["agent-smith-py"];

  constructor(agentType: HTTPAgentType, options: HTTPAgentOptions = {}) {
    this.agentType = agentType;
    this.options = options;
    this.config = HTTP_AGENT_CONFIG[agentType];
    this.baseUrl = `http://localhost:${this.config.port}`;
  }

  get name(): string {
    return this.agentType;
  }

  get port(): number {
    return this.config.port;
  }

  /**
   * Check if the agent is available (can be started)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { promisify } = await import("node:util");
      const exec = promisify((await import("node:child_process")).exec);
      // Check for uv (Python package manager)
      await exec("which uv || where uv");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the agent server
   */
  async start(): Promise<void> {
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    };

    // Determine working directory
    const cwd = this.config.cwd 
      ? `${this.options.cwd || process.cwd()}/${this.config.cwd}`
      : this.options.cwd || process.cwd();

    this.process = spawn(
      this.config.command,
      [...this.config.args, "--port", String(this.config.port)],
      {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    this.process.stdout?.on("data", (data) => {
      console.log(`[${this.agentType}] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data) => {
      console.error(`[${this.agentType}] ${data.toString().trim()}`);
    });

    // Wait for server to be ready
    await this.waitForReady();
  }

  /**
   * Wait for the agent server to be ready
   */
  private async waitForReady(maxAttempts = 30): Promise<void> {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.baseUrl}${this.config.healthPath}`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await delay(1000);
    }

    throw new Error(`Agent ${this.agentType} failed to start after ${maxAttempts}s`);
  }

  /**
   * Execute a task on the agent
   */
  async executeTask(prompt: string, taskId?: string): Promise<{
    status: string;
    result?: string;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}${this.config.taskPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, task_id: taskId }),
    });

    if (!response.ok) {
      throw new Error(`Task failed: ${response.statusText}`);
    }

    const data = await response.json() as { status: string; result?: string; error?: string };
    return data;
  }

  /**
   * Execute a task with streaming events via SSE
   */
  async *executeTaskStream(prompt: string, taskId?: string): AsyncGenerator<{
    event_type: string;
    task_id?: string;
    task_content?: string;
    worker_name?: string;
    result?: string;
    error?: string;
    subtasks?: string[];
    status?: string;
  }> {
    const response = await fetch(`${this.baseUrl}${this.config.streamPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, task_id: taskId }),
    });

    if (!response.ok) {
      throw new Error(`Stream failed: ${response.statusText}`);
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
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            yield event;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  /**
   * Stop the agent server
   */
  stop(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}
