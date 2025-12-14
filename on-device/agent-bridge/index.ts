/**
 * Agent Bridge - PartyKit Client & MCP Server
 *
 * 1. Connects to PartyKit relay (Cloud) to receive tasks via native WebSocket.
 * 2. Exposes a local MCP Server for agents to report back (Streamable HTTP).
 * 3. Spawns agents as subprocesses to execute tasks.
 * 4. Serves a terminal UI via /terminal for Under Hood viewer.
 */

import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
import { z } from "zod";
import { parseArgs } from "util";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { spawn, type IPty } from "bun-pty";
import {
  createAgent,
  getAvailableAgents,
  type AgentType,
  AgentError,
} from "./agents";
import { getTerminalHTML } from "./terminal-page";

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
    },
    "mcp-port": {
      type: "string",
    },
    room: {
      type: "string",
    },
    // Ignore other flags
    serve: { type: "boolean" },
  },
  strict: false,
  allowPositionals: true,
});

// Configuration
// Use production PartyKit URL by default, can be overridden by env var for local dev
const PARTY_HOST =
  process.env.PARTY_HOST ||
  "heycomputer-agents-rooms.bishwenduk029.partykit.dev";
// Prefer CLI args over env vars if provided (no default - connect only via /connect endpoint)
const PARTY_ROOM = values.room || process.env.PARTY_ROOM || "";
const AGENT_ID = process.env.AGENT_ID || "on-device-computer";

// Prefer CLI args over env vars if provided
const MCP_SERVER_PORT = parseInt(
  values["mcp-port"] || process.env.MCP_SERVER_PORT || "3001",
);

// --- Agent stdout/stderr log file (tailed by Tauri desktop UI) ---

const DEFAULT_AGENT_BRIDGE_LOG_FILE = join(
  homedir(),
  ".nirmanus",
  "agent-bridge",
  "agent-bridge.log",
);

const AGENT_BRIDGE_LOG_FILE =
  process.env.AGENT_BRIDGE_LOG_FILE || DEFAULT_AGENT_BRIDGE_LOG_FILE;

process.env.AGENT_BRIDGE_LOG_FILE = AGENT_BRIDGE_LOG_FILE;

try {
  mkdirSync(dirname(AGENT_BRIDGE_LOG_FILE), { recursive: true });
} catch {
  // ignore
}

function appendAgentBridgeLog(text: string) {
  if (process.env.AGENT_BRIDGE_LOG_CAPTURE === "1") return;
  try {
    appendFileSync(AGENT_BRIDGE_LOG_FILE, text);
  } catch {
    // ignore
  }
}

function clearAgentBridgeLog() {
  try {
    writeFileSync(AGENT_BRIDGE_LOG_FILE, "");
  } catch {
    // ignore
  }
}

// State
let opencodeClient: OpencodeClient | null = null;
let opencodeSessionId: string | null = null;
let ws: WebSocket | null = null;
let currentPartyRoom: string | null = null;
let selectedAgent: string = "opencode";

// PTY state
let ptyProcess: IPty | null = null;

// Terminal WebSocket clients (Under Hood viewer connections)
const terminalClients = new Set<WebSocket>();

// Broadcast message to all connected terminal clients
function broadcastToTerminals(message: object | string) {
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  for (const client of terminalClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// --- PTY Management ---

function spawnShellPty(): IPty {
  // Kill existing PTY if any
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // ignore
    }
    ptyProcess = null;
  }

  // Clear log file for fresh session
  clearAgentBridgeLog();

  const shell = process.env.SHELL || "/bin/zsh";
  console.log(`[PTY] Spawning shell: ${shell}`);
  appendAgentBridgeLog(`\n[${new Date().toISOString()}] [PTY] Spawning shell: ${shell}\n`);

  // Spawn a shell PTY that stays alive for multiple tasks
  const pty = spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCP_SERVER_URL: `http://localhost:${MCP_SERVER_PORT}/mcp`,
      TERM: "xterm-256color",
    },
  });

  // Pipe PTY output to log file and broadcast to terminals
  pty.onData((data: string) => {
    appendAgentBridgeLog(data);
    broadcastToTerminals({
      type: "output",
      content: data,
    });
  });

  pty.onExit(({ exitCode, signal }) => {
    console.log(`[PTY] Shell exited with code ${exitCode}, signal ${signal}`);
    appendAgentBridgeLog(`\n[${new Date().toISOString()}] [PTY] Shell exited with code ${exitCode}\n`);

    broadcastToTerminals({
      type: "status",
      status: "completed",
      message: `Shell exited with code ${exitCode}`,
      progress: 100,
    });

    ptyProcess = null;
  });

  ptyProcess = pty;
  return pty;
}

function killAgentPty() {
  if (ptyProcess) {
    console.log("[PTY] Killing shell process");
    try {
      ptyProcess.kill();
    } catch {
      // ignore
    }
    ptyProcess = null;
  }
}

function escapeForShell(str: string): string {
  // Escape single quotes and wrap in single quotes
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function writeTaskToPty(task: string, agentName: string) {
  if (!ptyProcess) {
    console.error("[PTY] No PTY process running");
    return false;
  }

  // Build the agent command with task
  // Format: agentName "task text with MCP suffix"
  const taskWithSuffix = task + TASK_SUFFIX;
  const escapedTask = escapeForShell(taskWithSuffix);
  const command = `${agentName} ${escapedTask}`;

  appendAgentBridgeLog(`\n[${new Date().toISOString()}] [TASK] Running: ${agentName} "<task>"\n`);

  // Write command to shell
  ptyProcess.write(command + "\n");

  return true;
}

// --- Task Execution ---

const TASK_SUFFIX = `

IMPORTANT: Use the "voice-updates" MCP tool (submit_response) to notify the user about:
- Task progress and status updates
- Any questions or clarifications needed
- When the task is complete
This allows the voice assistant to speak updates to the user in real-time.`;

const SUPPORTED_AGENTS: AgentType[] = [
  "opencode",
  "droid",
  "gemini",
  "codex",
  "claude",
  "goose",
];

async function handleTask(
  taskText: string,
  agentName: string = "opencode",
): Promise<string> {
  console.error(`🚀 Executing task with agent: ${agentName}`);
  appendAgentBridgeLog(
    `\n[${new Date().toISOString()}] 🚀 Executing task with agent: ${agentName}\n`,
  );
  const fullTask = taskText + TASK_SUFFIX;

  // Check if it's a supported CLI agent
  if (SUPPORTED_AGENTS.includes(agentName as AgentType)) {
    try {
      const agent = createAgent(agentName as AgentType);

      // Check availability
      const available = await agent.isAvailable();
      if (!available) {
        throw new Error(`Agent '${agentName}' is not installed or not in PATH`);
      }

      // Run with MCP server URL in environment
      const env = {
        MCP_SERVER_URL: `http://localhost:${MCP_SERVER_PORT}/mcp`,
      };

      const result = await (agent as any).run(fullTask, env);
      return result.stdout || "Task completed";
    } catch (error) {
      if (error instanceof AgentError) {
        console.error(`❌ Agent error: ${error.message}`);
        appendAgentBridgeLog(
          `\n[${new Date().toISOString()}] ❌ Agent error: ${error.message}\n`,
        );
        if (error.stderr) console.error(`stderr: ${error.stderr}`);
      } else {
        console.error(`❌ Error running agent ${agentName}:`, error);
        appendAgentBridgeLog(
          `\n[${new Date().toISOString()}] ❌ Error running agent ${agentName}: ${String(
            error,
          )}\n`,
        );
      }
      throw error;
    }
  }
}

// --- PartyKit Connection ---

function connectToPartyKit(room: string) {
  // Don't reconnect if already connected to the same room
  if (ws && ws.readyState === WebSocket.OPEN && currentPartyRoom === room) {
    console.log(`already connected to room ${room}`);
    return;
  }

  // Close existing connection if any
  if (ws) {
    ws.close();
    ws = null;
  }

  currentPartyRoom = room;
  const protocol = PARTY_HOST.includes("localhost") ? "ws" : "wss";
  const url = `${protocol}://${PARTY_HOST}/parties/main/${room}?id=${AGENT_ID}&role=computer`;
  console.error(`🔌 Connecting to PartyKit relay at ${url}...`);
  appendAgentBridgeLog(
    `\n[${new Date().toISOString()}] 🔌 Connecting to PartyKit room: ${room}\n`,
  );

  ws = new WebSocket(url);

  ws.onopen = () => console.error(`✅ Connected to PartyKit room: ${room}`);

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data.toString());
      if (data.type === "tasks") {
        const taskText = data.content;
        // Use selected agent from desktop UI, fall back to task-specified agent, then default
        const agent = selectedAgent || data.agent || "opencode";
        console.error(`📥 Task received: ${taskText.substring(0, 50)}...`);
        console.error(`🤖 Using agent: ${agent}`);

        // Broadcast task to terminal clients
        broadcastToTerminals({
          type: "task",
          agent,
          content: taskText,
        });

        sendUpdate("running", `Started ${agent}...`, 0);

        // Write task to PTY if running, otherwise fall back to handleTask
        if (ptyProcess) {
          const success = writeTaskToPty(taskText, agent);
          if (!success) {
            console.error("❌ Failed to write task to PTY");
            sendUpdate("error", "Failed to write task to PTY", 0);
          }
          // Note: task completion will be reported via MCP submit_response from agent
        } else {
          // Fallback to direct execution if no PTY
          try {
            const result = await handleTask(taskText, agent);
            sendUpdate("completed", result, 100);
            console.error(`✅ Task finished successfully`);
          } catch (error) {
            console.error("❌ Task failed:", error);
            sendUpdate(
              "error",
              `Task failed: ${error instanceof Error ? error.message : String(error)}`,
              0,
            );
          }
        }
      }
    } catch (error) {
      console.error("❌ Error processing message:", error);
    }
  };

  ws.onclose = () => {
    console.error("📴 Disconnected.");
    appendAgentBridgeLog(`\n[${new Date().toISOString()}] 📴 Disconnected.\n`);
    // Only auto-reconnect if it wasn't an intentional switch or if we want persistent connection
    // For now, let's allow reconnection to the same room
    if (currentPartyRoom === room) {
      console.error("Reconnecting in 3s...");
      setTimeout(() => connectToPartyKit(room), 3000);
    }
  };

  ws.onerror = (e) => console.error("WebSocket Error:", e);
}

function sendUpdate(status: string, message: string, progress: number) {
  // Send to PartyKit
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "task-update",
        status,
        message,
        progress,
        agent_id: AGENT_ID,
      }),
    );
  }

  // Broadcast to terminal clients
  broadcastToTerminals({
    type: "status",
    status,
    message,
    progress,
  });
}

// --- MCP Server Setup ---

const mcpServer = new McpServer({
  name: "voice-updates",
  version: "1.0.0",
});

// Register the submit_response tool
mcpServer.tool(
  "submit_response",
  "Send a response or update to the voice assistant user. Use this to report progress, ask questions, or notify task completion.",
  {
    message: z.string().describe("The message to send to the user"),
    status: z
      .enum(["running", "completed", "error", "needs_input"])
      .optional()
      .describe("Current task status"),
    progress: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Task progress percentage (0-100)"),
  },
  async ({ message, status, progress }) => {
    console.error(`📤 [MCP] submit_response: ${message.substring(0, 50)}...`);
    sendUpdate(status || "running", message, progress ?? 50);
    return {
      content: [{ type: "text", text: `Response sent to user: ${message}` }],
    };
  },
);

// --- Hono App ---

const app = new Hono();
const transport = new StreamableHTTPTransport();

app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

app.get("/health", (c) =>
  c.json({ status: "ok", partykit: ws?.readyState === WebSocket.OPEN }),
);

app.post("/connect", async (c) => {
  try {
    const body = await c.req.json();
    const { roomId, agent } = body;
    if (!roomId) return c.json({ error: "roomId is required" }, 400);

    // Store selected agent if provided
    if (agent) {
      selectedAgent = agent;
      console.log(`[MCP] Selected agent: ${agent}`);
    }

    // Spawn shell PTY (stays alive for multiple tasks)
    try {
      spawnShellPty();
      console.log(`[PTY] Shell spawned, will use agent: ${selectedAgent}`);
    } catch (ptyError) {
      console.error(`[PTY] Failed to spawn shell: ${ptyError}`);
      return c.json({ error: `Failed to spawn shell: ${ptyError}` }, 500);
    }

    console.log(`[MCP] Request to connect to room: ${roomId}`);
    connectToPartyKit(roomId);
    return c.json({ status: "connected", roomId, agent: selectedAgent, pty: true });
  } catch (e) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.post("/disconnect", async (c) => {
  console.log(`[MCP] Request to disconnect from PartyKit`);

  // Kill PTY process
  killAgentPty();

  if (ws) {
    currentPartyRoom = null; // Prevent auto-reconnect
    ws.close();
    ws = null;
    return c.json({ status: "disconnected" });
  }
  return c.json({ status: "not_connected" });
});

app.get("/status", (c) => {
  return c.json({
    connected: ws?.readyState === WebSocket.OPEN,
    room: currentPartyRoom,
    agent: selectedAgent,
    pty: ptyProcess !== null,
  });
});

app.get("/agents", async (c) => {
  const available = await getAvailableAgents();
  return c.json({
    supported: SUPPORTED_AGENTS,
    available,
  });
});

// Terminal page for Under Hood viewer (served as iframe)
app.get("/terminal", (c) => {
  return c.html(getTerminalHTML(MCP_SERVER_PORT));
});

// --- Main ---

async function main() {
  // Initial connection if room provided via CLI args or ENV
  if (PARTY_ROOM) {
    connectToPartyKit(PARTY_ROOM);
  } else {
    console.log("Waiting for /connect request to join a room...");
  }

  console.error(`🔌 MCP Server running on port ${MCP_SERVER_PORT}`);

  Bun.serve({
    port: MCP_SERVER_PORT,
    fetch(req, server) {
      const url = new URL(req.url);

      // Handle WebSocket upgrade for terminal
      if (url.pathname === "/terminal/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      }

      // Handle all other requests with Hono
      return app.fetch(req, server);
    },
    websocket: {
      open(ws) {
        console.log("[Terminal] Client connected");
        terminalClients.add(ws as unknown as WebSocket);

        // Send welcome message with selected agent info
        ws.send(JSON.stringify({
          type: "log",
          content: `Connected to agent-bridge. Selected agent: ${selectedAgent || "none"}`,
        }));
      },
      message(ws, message) {
        // Forward terminal input to PTY
        if (ptyProcess) {
          const input = typeof message === "string" ? message : message.toString();
          ptyProcess.write(input);
        }
      },
      close(ws) {
        console.log("[Terminal] Client disconnected");
        terminalClients.delete(ws as unknown as WebSocket);
      },
    },
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
