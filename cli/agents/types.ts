export type StreamEventType = 
  | "message" 
  | "completion" 
  | "tool_call" 
  | "tool_update" 
  | "thinking" 
  | "plan" 
  | "status" 
  | "permission";

export interface StreamEvent {
  type: StreamEventType | string;
  timestamp?: number;
  data: Record<string, unknown>;
}

export async function checkExecutable(name: string): Promise<boolean> {
  const { spawn } = await import("child_process");
  return new Promise((resolve) => {
    const proc = spawn("which", [name], { stdio: "pipe" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
