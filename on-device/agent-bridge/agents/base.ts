import type { CLIAgent, AgentOutput } from "./types";
import { AgentError, checkExecutable } from "./types";
import { appendFileSync } from "fs";

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
    // When running as a Tauri sidecar there is no TTY, so we wrap the command with `script`
    // to allocate a pseudo-terminal.
    const needsPty = !process.stdin.isTTY;
    const spawnArgs = needsPty
      ? ["script", "-q", "-F", "/dev/null", ...args]
      : args;

    const proc = Bun.spawn(spawnArgs, {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...env },
    });

    const outputChunks: string[] = [];
    const errorChunks: string[] = [];
    const decoder = new TextDecoder();

    // Stream stdout
    const stdoutPromise = (async () => {
      const reader = proc.stdout.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        outputChunks.push(text);
        process.stdout.write(text);
        appendLog(text);
      }
    })();

    // Stream stderr
    const stderrPromise = (async () => {
      const reader = proc.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        errorChunks.push(text);
        process.stderr.write(text);
        appendLog(text);
      }
    })();

    // Wait with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new AgentError(`Agent '${this.name}' timed out`, this.name));
      }, this.timeoutMs);
    });

    try {
      const exitCode = await Promise.race([proc.exited, timeoutPromise]);
      await Promise.all([stdoutPromise, stderrPromise]);

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
      throw new AgentError(
        `Agent '${this.name}' failed: ${error}`,
        this.name,
      );
    }
  }
}
