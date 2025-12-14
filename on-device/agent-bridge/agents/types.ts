import { Subprocess } from "bun";

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
  try {
    const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}
