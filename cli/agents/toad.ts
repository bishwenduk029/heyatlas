/**
 * Toad Agent - CLI wrapper for toad (ACP-based agent orchestrator)
 * 
 * Translates toad's JSON-RPC/ACP protocol to StreamEvents for AtlasTunnel.
 * No modifications to toad required - this wrapper intercepts stdout and translates.
 * 
 * ACP Protocol Reference: https://agentclientprotocol.com/protocol/schema
 */

import { BaseCLIAgent } from "./base";
import type { StreamHandler, StreamEvent, InteractiveSession } from "./types";
import { isStoredEvent } from "./types";
import type { AtlasTunnel } from "../tunnel";
import { ptyManager } from "./pty-manager";

// ACP session update types
type SessionUpdateType = 
  | "user_message_chunk"
  | "agent_message_chunk" 
  | "agent_thought_chunk"
  | "tool_call"
  | "tool_call_update"
  | "plan"
  | "available_commands_update"
  | "current_mode_update";

interface ACPSessionUpdate {
  sessionUpdate: SessionUpdateType;
  content?: { type: string; text?: string };
  title?: string;
  toolCallId?: string;
  status?: string;
  kind?: string;
  entries?: Array<{ content: string; status: string; priority: string }>;
  [key: string]: unknown;
}

interface ACPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: {
    sessionId?: string;
    update?: ACPSessionUpdate;
    [key: string]: unknown;
  };
}

interface ACPResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

type ACPMessage = ACPNotification | ACPResponse;

/**
 * Translates ACP JSON-RPC messages from toad to StreamEvents
 */
class ToadStreamHandler implements StreamHandler {
  private buffer = "";
  private messageBuffer = ""; // For accumulating agent message chunks

  parse(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const msg = JSON.parse(line) as ACPMessage;
        const event = this.convertACPMessage(msg);
        if (event) {
          events.push(event);
        }
      } catch {
        // Not valid JSON - emit as raw output
        events.push({
          type: "raw",
          timestamp: Date.now(),
          data: { text: line },
        });
      }
    }

    return events;
  }

  flush(): StreamEvent[] {
    const events: StreamEvent[] = [];
    
    // Flush any accumulated message buffer as a complete message
    if (this.messageBuffer.trim()) {
      events.push({
        type: "message",
        timestamp: Date.now(),
        data: { role: "assistant", content: this.messageBuffer.trim() },
      });
      this.messageBuffer = "";
    }
    
    // Flush remaining buffer
    if (this.buffer.trim()) {
      try {
        const msg = JSON.parse(this.buffer) as ACPMessage;
        const event = this.convertACPMessage(msg);
        if (event) events.push(event);
      } catch {
        events.push({
          type: "raw",
          timestamp: Date.now(),
          data: { text: this.buffer },
        });
      }
      this.buffer = "";
    }
    
    return events;
  }

  private convertACPMessage(msg: ACPMessage): StreamEvent | null {
    // Handle JSON-RPC notifications (session updates)
    if ("method" in msg && msg.method === "session/update") {
      return this.convertSessionUpdate(msg.params?.update);
    }
    
    // Handle JSON-RPC responses (usually for RPC calls we made)
    if ("result" in msg || "error" in msg) {
      // Could emit status events for errors
      if (msg.error) {
        return {
          type: "status",
          timestamp: Date.now(),
          data: { text: `Error: ${msg.error.message}`, code: msg.error.code },
        };
      }
      return null; // Ignore successful responses
    }
    
    return null;
  }

  private convertSessionUpdate(update?: ACPSessionUpdate): StreamEvent | null {
    if (!update) return null;
    
    const timestamp = Date.now();
    
    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        const text = update.content?.text;
        if (text) {
          return {
            type: "message",
            timestamp,
            data: { role: "user", content: text },
          };
        }
        return null;
      }
      
      case "agent_message_chunk": {
        const text = update.content?.text;
        if (text) {
          // Accumulate chunks into buffer
          this.messageBuffer += text;
          // Don't emit individual chunks - we'll emit complete message on flush
          // But for real-time UI, emit as status update
          return {
            type: "status",
            timestamp,
            data: { text: this.messageBuffer, streaming: true },
          };
        }
        return null;
      }
      
      case "agent_thought_chunk": {
        const text = update.content?.text;
        if (text) {
          return {
            type: "thinking",
            timestamp,
            data: { text },
          };
        }
        return null;
      }
      
      case "tool_call": {
        return {
          type: "tool_call",
          timestamp,
          data: {
            toolCallId: update.toolCallId,
            toolName: update.title,
            kind: update.kind,
            status: update.status,
          },
        };
      }
      
      case "tool_call_update": {
        return {
          type: "tool_update",
          timestamp,
          data: {
            toolCallId: update.toolCallId,
            status: update.status,
            title: update.title,
            kind: update.kind,
          },
        };
      }
      
      case "plan": {
        return {
          type: "plan",
          timestamp,
          data: {
            entries: update.entries || [],
          },
        };
      }
      
      case "current_mode_update": {
        return {
          type: "status",
          timestamp,
          data: { text: `Mode: ${update.currentModeId}`, modeId: update.currentModeId },
        };
      }
      
      case "available_commands_update":
        // Not useful for UI display
        return null;
      
      default:
        return null;
    }
  }
}

export class ToadAgent extends BaseCLIAgent {
  override name = "toad";
  override executable = "toad";
  override interactive = true;
  override timeoutMs = 30 * 60 * 1000; // 30 minutes for long-running sessions

  override buildCommand(task: string): string[] {
    // For one-shot mode, use toad with the task as prompt
    return ["toad", "--headless", "--prompt", task];
  }

  override createStreamHandler(): StreamHandler {
    return new ToadStreamHandler();
  }

  /**
   * Run toad in interactive mode with persistent stdin/stdout.
   * Uses ACP JSON-RPC protocol for bidirectional communication.
   */
  override async runInteractive(tunnel: AtlasTunnel): Promise<InteractiveSession> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(`Toad executable not found in PATH`);
    }

    const streamHandler = new ToadStreamHandler();
    let currentTaskId: string | null = null;
    let isAlive = true;
    let sessionId: string | null = null;
    let requestId = 0;

    const nextRequestId = () => `req-${++requestId}`;

    const { proc } = ptyManager.spawn("toad", ["--headless"], {
      taskId: "toad-interactive",
      pipeStdin: true,
      onOutput: (chunk) => {
        const events = streamHandler.parse(chunk);
        
        for (const event of events) {
          console.log(`📡 toad: ${event.type}${currentTaskId ? ` [${currentTaskId.slice(0, 8)}]` : ""}`);
          
          if (currentTaskId && tunnel.isConnected) {
            // Route based on event type: stored vs ephemeral
            if (isStoredEvent(event)) {
              tunnel.appendContext(currentTaskId, [event]).catch(() => {});
            } else {
              tunnel.broadcastTaskEvent(currentTaskId, event).catch(() => {});
            }
            
            // Voice update on completion
            if (event.type === "completion" && event.data.summary) {
              tunnel.updateHuman(event.data.summary as string).catch(() => {});
            }
          }

          // Detect session completion (tool_call with status completed for final tool)
          // or explicit end_turn response
          if (event.type === "status" && event.data.stopReason === "end_turn") {
            if (currentTaskId) {
              // Flush accumulated message as final message event
              const flushEvents = streamHandler.flush();
              for (const fe of flushEvents) {
                if (isStoredEvent(fe)) {
                  tunnel.appendContext(currentTaskId, [fe]).catch(() => {});
                }
              }
              
              tunnel.updateTask(currentTaskId, { state: "completed", result: "Done" }).catch(() => {});
              console.log(`✅ Task ${currentTaskId.slice(0, 8)} completed`);
            }
          }
        }
      },
      onExit: (code) => {
        console.log(`⚠️ Toad exited (code ${code})`);
        isAlive = false;
        if (currentTaskId) {
          tunnel.updateTask(currentTaskId, {
            state: code === 0 ? "completed" : "failed",
            result: code === 0 ? "Session ended" : `Exit code ${code}`,
          }).catch(() => {});
        }
      },
    });

    // Initialize toad session using ACP protocol
    const initMsg = {
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientInfo: {
          name: "heyatlas-cli",
          version: "1.0.0",
        },
        capabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      },
      id: nextRequestId(),
    };
    proc.stdin?.write(JSON.stringify(initMsg) + "\n");
    
    // Create a new session
    const newSessionMsg = {
      jsonrpc: "2.0",
      method: "session/new",
      params: {},
      id: nextRequestId(),
    };
    proc.stdin?.write(JSON.stringify(newSessionMsg) + "\n");
    
    console.log(`🔄 Interactive toad session initialized`);

    return {
      send(message: string, taskId?: string) {
        currentTaskId = taskId || null;

        if (taskId) {
          tunnel.updateTask(taskId, { state: "in-progress" }).catch(() => {});
        }

        // Send prompt using ACP session/prompt method
        const promptMsg = {
          jsonrpc: "2.0",
          method: "session/prompt",
          params: {
            sessionId: sessionId || "default",
            content: [{ type: "text", text: message }],
          },
          id: taskId || nextRequestId(),
        };
        
        console.log(`📤 toad: ${JSON.stringify(promptMsg).slice(0, 120)}...`);
        proc.stdin?.write(JSON.stringify(promptMsg) + "\n");
      },

      kill() {
        isAlive = false;
        ptyManager.killByTaskId("toad-interactive");
      },

      isAlive() {
        return isAlive;
      },
    };
  }
}
