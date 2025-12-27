import type {
  CLIAgent,
  AgentOutput,
  StreamEvent,
  RunOptions,
  InteractiveSession,
} from "./types";
import { AgentError, checkExecutable } from "./types";
import { appendFileSync } from "fs";
import { ptyManager } from "./pty-manager";
import type { AtlasTunnel, Task } from "../tunnel";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type StreamEventCallback = (event: StreamEvent) => void;

/** Parsed task status from agent output */
interface TaskStatusOutput {
  taskStatus: "pending-user-feedback" | "completed" | "failed";
  summary: string;
}

/** Extract task status JSON from agent output */
function extractTaskStatus(output: string): TaskStatusOutput | null {
  // Look for JSON block with taskStatus
  const jsonMatch = output.match(
    /```json\s*(\{[\s\S]*?"taskStatus"[\s\S]*?\})\s*```/,
  );
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }
  // Also try inline JSON at end of output
  const inlineMatch = output.match(/\{[^{}]*"taskStatus"[^{}]*\}\s*$/);
  if (inlineMatch) {
    try {
      return JSON.parse(inlineMatch[0]);
    } catch {}
  }
  return null;
}

/**
 * Base class for CLI agents.
 * Handles full task lifecycle: state updates + context streaming via tunnel RPC.
 */
export abstract class BaseCLIAgent implements CLIAgent {
  abstract name: string;
  abstract executable: string;
  interactive: boolean = false;
  timeoutMs: number = DEFAULT_TIMEOUT_MS;

  abstract buildCommand(task: string): string[];
  abstract createStreamHandler?(): {
    parse(chunk: string): StreamEvent[];
    flush(): StreamEvent[];
  };

  async isAvailable(): Promise<boolean> {
    return checkExecutable(this.executable);
  }

  /**
   * Wrap task with full context and prompt instructions for structured output.
   * Used in non-interactive mode to get status for voice feedback.
   */
  buildTaskWithPrompt(task: string, context?: any[]): string {
    const contextStr = context?.length
      ? `\n\n<task_context>\n${JSON.stringify(context, null, 2)}\n</task_context>`
      : "";

    return `${task}${contextStr}
- Keep summary concise for voice feedback`;
  }

  /**
   * Run a one-shot task.
   * Handles full lifecycle: in-progress -> context streaming -> completed/failed
   */
  async run(task: Task, options: RunOptions = {}): Promise<AgentOutput> {
    const available = await this.isAvailable();
    if (!available) {
      throw new AgentError(
        `Agent '${this.name}' executable '${this.executable}' not found in PATH`,
        this.name,
      );
    }

    const { env, tunnel, taskContext, onOutput, onStreamEvent } = options;
    const taskId = task.id; // Use task.id directly
    // Wrap task with full context and prompt for structured status output
    const promptedTask = this.buildTaskWithPrompt(
      task.description,
      taskContext,
    );
    const args = this.buildCommand(promptedTask);
    const startTime = Date.now();

    const logFilePath = process.env.AGENT_BRIDGE_LOG_FILE;
    const captureBySidecar = process.env.AGENT_BRIDGE_LOG_CAPTURE === "1";
    const appendLog = (text: string) => {
      if (!logFilePath || captureBySidecar) return;
      try {
        appendFileSync(logFilePath, text);
      } catch {
        // ignore
      }
    };

    console.error(`🐚 Spawning ${this.name}: ${args.join(" ")}`);
    appendLog(
      `\n[${new Date().toISOString()}] 🐚 Spawning ${this.name}: ${args.join(" ")}\n`,
    );

    // Mark task as in-progress
    if (tunnel && taskId) {
      await tunnel.updateTask(taskId, { state: "in-progress" }).catch(() => {});
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    const outputChunks: string[] = [];
    const errorChunks: string[] = [];
    const streamHandler = this.createStreamHandler?.();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        ptyManager.killByTaskId(taskId || "");
        if (tunnel && taskId) {
          await tunnel
            .updateTask(taskId, { state: "failed", result: "Task timed out" })
            .catch(() => {});
        }
        reject(new AgentError(`Agent '${this.name}' timed out`, this.name));
      }, this.timeoutMs);

      ptyManager.spawn(command, commandArgs, {
        env,
        taskId,
        onOutput: (chunk, stream) => {
          if (stream === "stdout") {
            outputChunks.push(chunk);
            if (streamHandler) {
              const events = streamHandler.parse(chunk);
              for (const event of events) {
                onStreamEvent?.(event);
                // Store user/assistant messages and completion events
                if (tunnel && taskId) {
                  const isUserOrAssistant =
                    event.type === "message" &&
                    (event.data.role === "user" ||
                      event.data.role === "assistant");
                  const isCompletion = event.type === "completion";
                  if (isUserOrAssistant || isCompletion) {
                    tunnel.appendContext(taskId, [event], "completed");
                  }
                  // Trigger voice update when completion event occurs
                  if (isCompletion && event.data.summary) {
                    tunnel.updateHuman(event.data.summary).catch((err) => {
                      console.error("Failed to send voice update:", err);
                    });
                  }
                }
              }
            }
          } else {
            errorChunks.push(chunk);
          }
          // appendLog(chunk);
          onOutput?.(chunk, stream);
        },
        onExit: async (exitCode) => {
          clearTimeout(timeout);

          const durationMs = Date.now() - startTime;
          const stdout = outputChunks.join("");
          const stderr = errorChunks.join("");

          if (exitCode !== 0) {
            // Mark task as failed
            if (tunnel && taskId) {
              await tunnel
                .updateTask(taskId, {
                  state: "failed",
                  result: stderr || `Exit code ${exitCode}`,
                })
                .catch(() => {});
            }
            reject(
              new AgentError(
                `Agent '${this.name}' exited with code ${exitCode}`,
                this.name,
                exitCode,
                stdout,
                stderr,
              ),
            );
          }
        },
      });
    });
  }

  /**
   * Run in interactive mode. Override in subclasses that support it.
   */
  async runInteractive(tunnel: AtlasTunnel): Promise<InteractiveSession> {
    throw new Error(`Interactive mode not supported for ${this.name}`);
  }
}
