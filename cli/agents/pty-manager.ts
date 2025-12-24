import { spawn, type ChildProcess } from "child_process";

export type OutputCallback = (chunk: string, stream: "stdout" | "stderr") => void;

interface ManagedProcess {
  proc: ChildProcess;
  taskId?: string;
}

class PtyManager {
  private processes = new Map<string, ManagedProcess>();
  private idCounter = 0;

  constructor() {
    // Register cleanup handlers
    process.on("SIGINT", () => this.killAll());
    process.on("SIGTERM", () => this.killAll());
    process.on("exit", () => this.killAll());
  }

  spawn(
    command: string,
    args: string[],
    options: {
      env?: Record<string, string>;
      taskId?: string;
      onOutput?: OutputCallback;
      onExit?: (code: number) => void;
      pipeStdin?: boolean;
    } = {}
  ): { id: string; proc: ChildProcess } {
    const id = `proc-${++this.idCounter}`;
    
    // Use script for TTY emulation when needed (but not if we need piped stdin)
    const needsPty = !process.stdin.isTTY && !options.pipeStdin;
    const spawnArgs = needsPty
      ? ["script", "-q", "-F", "/dev/null", command, ...args]
      : [command, ...args];

    const cmd = spawnArgs[0];
    const cmdArgs = spawnArgs.slice(1);

    const proc = spawn(cmd, cmdArgs, {
      stdio: [options.pipeStdin ? "pipe" : "inherit", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });

    this.processes.set(id, { proc, taskId: options.taskId });

    // Stream stdout
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      options.onOutput?.(text, "stdout");
    });

    // Stream stderr
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      options.onOutput?.(text, "stderr");
    });

    proc.on("close", (code) => {
      this.processes.delete(id);
      options.onExit?.(code ?? 1);
    });

    proc.on("error", (err) => {
      console.error(`Process ${id} error:`, err.message);
      this.processes.delete(id);
    });

    return { id, proc };
  }

  kill(id: string): boolean {
    const managed = this.processes.get(id);
    if (!managed) return false;

    try {
      managed.proc.kill("SIGTERM");
      // Force kill after 2 seconds if still alive
      setTimeout(() => {
        try {
          managed.proc.kill("SIGKILL");
        } catch {
          // Already dead
        }
      }, 2000);
    } catch {
      // Process may already be dead
    }
    this.processes.delete(id);
    return true;
  }

  killByTaskId(taskId: string): boolean {
    for (const [id, managed] of this.processes) {
      if (managed.taskId === taskId) {
        return this.kill(id);
      }
    }
    return false;
  }

  killAll(): void {
    for (const [id, managed] of this.processes) {
      try {
        managed.proc.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
    }
    this.processes.clear();
  }

  getRunningCount(): number {
    return this.processes.size;
  }

  getRunningTaskIds(): string[] {
    return Array.from(this.processes.values())
      .filter((m) => m.taskId)
      .map((m) => m.taskId!);
  }
}

// Singleton instance
export const ptyManager = new PtyManager();
