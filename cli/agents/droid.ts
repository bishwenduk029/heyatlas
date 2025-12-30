import { BaseCLIAgent } from "./base";
import type { StreamHandler, StreamEvent, InteractiveSession } from "./types";
import type { AtlasTunnel } from "../tunnel";
import { ptyManager } from "./pty-manager";

class DroidStreamHandler implements StreamHandler {
  private buffer = "";

  parse(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        events.push({
          type: raw.type === "system" ? raw.subtype || "system" : raw.type,
          timestamp: raw.timestamp || Date.now(),
          data: raw,
        });
      } catch {
        events.push({ type: "raw", timestamp: Date.now(), data: { text: line } });
      }
    }
    return events;
  }

  flush(): StreamEvent[] {
    if (!this.buffer.trim()) return [];
    try {
      const raw = JSON.parse(this.buffer);
      return [{ type: raw.type, timestamp: raw.timestamp || Date.now(), data: raw }];
    } catch {
      return [{ type: "raw", timestamp: Date.now(), data: { text: this.buffer } }];
    }
  }
}

export class DroidAgent extends BaseCLIAgent {
  name = "droid";
  executable = "droid";
  interactive = true;

  buildCommand(task: string): string[] {
    return ["droid", "exec", task, "--auto", "high", "--output-format", "stream-json"];
  }

  createStreamHandler(): StreamHandler {
    return new DroidStreamHandler();
  }

  /**
   * Run droid in interactive mode with persistent stdin/stdout.
   * Uses stream-jsonrpc format for bidirectional communication.
   * Updates task state via RPC calls to Atlas agent.
   */
  async runInteractive(tunnel: AtlasTunnel): Promise<InteractiveSession> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(`Droid executable not found in PATH`);
    }

    const streamHandler = new DroidStreamHandler();
    let currentTaskId: string | null = null;
    let isAlive = true;
    let pendingEvents: StreamEvent[] = [];
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;

    // Batch context updates to reduce RPC calls
    const flushEvents = async () => {
      if (pendingEvents.length > 0 && currentTaskId) {
        const events = pendingEvents;
        pendingEvents = [];
        await tunnel.appendContext(currentTaskId, events).catch(() => {});
      }
      flushTimeout = null;
    };

    const scheduleFlush = () => {
      if (!flushTimeout) {
        flushTimeout = setTimeout(flushEvents, 100);
      }
    };

    const { proc } = ptyManager.spawn("droid", [
      "exec",
      "--input-format", "stream-jsonrpc",
      "--output-format", "stream-jsonrpc",
      "--auto", "high",
    ], {
      taskId: "interactive-session",
      pipeStdin: true,
      onOutput: (chunk) => {
        const events = streamHandler.parse(chunk);
        for (const event of events) {
          // Queue event for batched context update
          if (currentTaskId) {
            pendingEvents.push(event);
            scheduleFlush();
          }

          // Detect completion
          const isCompletion = event.type === "completion" || 
            (event.type === "notification" && 
             (event.data as any)?.params?.notification?.type === "droid_working_state_changed" &&
             (event.data as any)?.params?.notification?.newState === "idle");

          if (isCompletion && currentTaskId) {
            // Flush pending events before marking complete
            if (flushTimeout) {
              clearTimeout(flushTimeout);
              flushEvents();
            }
            tunnel.updateTask(currentTaskId, { state: "completed", result: "Done" }).catch(() => {});
            console.log(`✅ Task ${currentTaskId.slice(0,8)} completed`);
          }
        }
      },
      onExit: (code) => {
        console.log(`⚠️ Droid exited (code ${code})`);
        isAlive = false;
        if (currentTaskId) {
          tunnel.updateTask(currentTaskId, { 
            state: code === 0 ? "completed" : "failed",
            result: code === 0 ? "Session ended" : `Exit code ${code}`,
          }).catch(() => {});
        }
      },
    });

    // Initialize the session
    const initMsg = {
      jsonrpc: "2.0",
      factoryApiVersion: "1.0.0",
      type: "request",
      method: "droid.initialize_session",
      params: {
        machineId: `heyatlas-${Date.now()}`,
        cwd: process.cwd(),
      },
      id: `init-${Date.now()}`,
    };
    proc.stdin?.write(JSON.stringify(initMsg) + "\n");
    console.log(`🔄 Interactive droid session initialized`);

    return {
      send(message: string, taskId?: string) {
        currentTaskId = taskId || null;
        
        // Mark task as in-progress and clear pendingInput
        if (taskId) {
          tunnel.updateTask(taskId, { state: "in-progress", pendingInput: undefined }).catch(() => {});
        }
        
        const rpcMsg = {
          jsonrpc: "2.0",
          factoryApiVersion: "1.0.0",
          type: "request",
          method: "droid.add_user_message",
          params: { text: message },
          id: taskId || `msg-${Date.now()}`,
        };
        proc.stdin?.write(JSON.stringify(rpcMsg) + "\n");
      },
      
      kill() {
        isAlive = false;
        if (flushTimeout) clearTimeout(flushTimeout);
        ptyManager.killByTaskId("interactive-session");
      },
      
      isAlive() {
        return isAlive;
      },
    };
  }
}
