export interface AgentOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface CLIAgent {
  name: string;
  executable: string;
  buildCommand(task: string): string[];
  timeoutMs?: number;
  isAvailable(): Promise<boolean>;
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
