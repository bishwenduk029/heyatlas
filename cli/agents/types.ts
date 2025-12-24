import type { AtlasTunnel, Task } from "../tunnel";
import type { OutputCallback } from "./pty-manager";

export interface AgentOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface StreamHandler {
  parse(chunk: string): StreamEvent[];
  flush(): StreamEvent[];
}

/**
 * Options for running an agent task
 */
export interface RunOptions {
  env?: Record<string, string>;
  taskId?: string;
  tunnel?: AtlasTunnel;
  taskContext?: any[]; // Full task.context array (stringified in prompt)
  onOutput?: OutputCallback;
  onStreamEvent?: (event: StreamEvent) => void;
}

/**
 * Unified interface for CLI agents.
 * All agents implement run() for one-shot tasks and optionally runInteractive() for persistent sessions.
 */
export interface CLIAgent {
  name: string;
  executable: string;
  interactive: boolean;
  timeoutMs?: number;
  
  buildCommand(task: string): string[];
  isAvailable(): Promise<boolean>;
  createStreamHandler?(): StreamHandler;
  
  /**
   * Run a one-shot task. Updates task state via tunnel if provided.
   */
  run(task: Task, options?: RunOptions): Promise<AgentOutput>;
  
  /**
   * Run in interactive mode (persistent process).
   * Returns a handle for sending subsequent messages.
   */
  runInteractive?(tunnel: AtlasTunnel): Promise<InteractiveSession>;
}

/**
 * Handle for an interactive agent session
 */
export interface InteractiveSession {
  /** Send a message to the running agent */
  send(message: string, taskId?: string): void;
  /** Kill the interactive process */
  kill(): void;
  /** Check if session is still alive */
  isAlive(): boolean;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly agentName: string,
    public readonly exitCode?: number,
    public readonly stdout?: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export async function checkExecutable(name: string): Promise<boolean> {
  const { spawn } = await import("child_process");
  return new Promise((resolve) => {
    const proc = spawn("which", [name], { stdio: "pipe" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
