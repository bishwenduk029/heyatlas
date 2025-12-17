import type { CLIAgent, AgentOutput } from "./types";
import { AgentError, checkExecutable } from "./types";
import { appendFileSync } from "fs";
import { spawn, type ChildProcess } from "child_process";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export abstract class BaseCLIAgent implements CLIAgent {
  abstract name: string;
  abstract executable: string;
  timeoutMs: number = DEFAULT_TIMEOUT_MS;

  abstract buildCommand(task: string): string[];

  async isAvailable(): Promise<boolean> {
    return checkExecutable(this.executable);
  }

  async run(
    task: string,
    env: Record<string, string> = {},
  ): Promise<AgentOutput> {
    const available = await this.isAvailable();
    if (!available) {
      throw new AgentError(
        `Agent '${this.name}' executable '${this.executable}' not found in PATH`,
        this.name,
      );
    }

    const args = this.buildCommand(task);
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

    // Some CLIs (e.g. Droid) use Ink and require a TTY raw mode.
    const needsPty = !process.stdin.isTTY;
    const spawnArgs = needsPty
      ? ["script", "-q", "-F", "/dev/null", ...args]
      : args;

    const command = spawnArgs[0];
    const commandArgs = spawnArgs.slice(1);

    const proc: ChildProcess = spawn(command, commandArgs, {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });

    const outputChunks: string[] = [];
    const errorChunks: string[] = [];

    // Stream stdout
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      process.stdout.write(text);
      appendLog(text);
    });

    // Stream stderr
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      errorChunks.push(text);
      process.stderr.write(text);
      appendLog(text);
    });

    // Wait for process with timeout
    const exitPromise = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new AgentError(`Agent '${this.name}' timed out`, this.name));
      }, this.timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code ?? 1);
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(
          new AgentError(
            `Agent '${this.name}' failed: ${err.message}`,
            this.name,
          ),
        );
      });
    });

    try {
      const exitCode = await exitPromise;
      const durationMs = Date.now() - startTime;
      const stdout = outputChunks.join("");
      const stderr = errorChunks.join("");

      if (exitCode !== 0) {
        throw new AgentError(
          `Agent '${this.name}' exited with code ${exitCode}`,
          this.name,
          exitCode,
          stdout,
          stderr,
        );
      }

      return { stdout, stderr, exitCode, durationMs };
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError(`Agent '${this.name}' failed: ${error}`, this.name);
    }
  }
}
