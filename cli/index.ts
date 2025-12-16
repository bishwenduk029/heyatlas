/**
 * Agent Warp - Tunnel local CLI agents to the cloud
 *
 * HTTP API server that manages tunnel connections for exposing
 * local CLI agents (opencode, claude, droid, etc.) to relay rooms.
 */

import { Hono } from "hono";
import { parseArgs } from "util";
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { CLIAgentBridge } from "./CLIAgentBridge";
import type { AgentType } from "./agents";

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: { type: "string" },
    room: { type: "string" },
    agent: { type: "string" },
  },
  strict: false,
  allowPositionals: true,
});

// Configuration
const PARTY_HOST = process.env.PARTY_HOST;
const PARTY_ROOM = (values.room as string) || process.env.PARTY_ROOM || "";
const AGENT_ID = process.env.AGENT_ID || "on-device-computer";
const DEFAULT_AGENT = ((values.agent as string) ||
  process.env.AGENT ||
  "opencode") as AgentType;
const API_PORT = parseInt(
  (values.port as string) || process.env.API_PORT || "3001",
);

// --- Logging ---

const AGENT_WARP_LOG_FILE =
  process.env.AGENT_WARP_LOG_FILE ||
  join(homedir(), ".heyatlas", "agent-warp", "agent-warp.log");

process.env.AGENT_WARP_LOG_FILE = AGENT_WARP_LOG_FILE;

try {
  mkdirSync(dirname(AGENT_WARP_LOG_FILE), { recursive: true });
} catch {
  // ignore
}

function appendLog(text: string) {
  if (process.env.AGENT_WARP_LOG_CAPTURE === "1") return;
  try {
    appendFileSync(
      AGENT_WARP_LOG_FILE,
      `\n[${new Date().toISOString()}] ${text}\n`,
    );
  } catch {
    // ignore
  }
}

// --- CLI Agent Bridge Instance ---

const bridge = new CLIAgentBridge({
  host: PARTY_HOST,
  agentId: AGENT_ID,
  defaultAgent: DEFAULT_AGENT,
  reconnect: true,
  reconnectDelay: 3000,
  onLog: appendLog,
});

// --- Hono HTTP API ---

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", connected: bridge.isConnected }),
);

app.post("/connect", async (c) => {
  try {
    const body = await c.req.json();
    const { roomId, agent } = body;
    if (!roomId) return c.json({ error: "roomId is required" }, 400);

    if (agent) {
      bridge.setAgent(agent);
    }

    console.log(`[API] Connecting to room: ${roomId}`);
    await bridge.connect(roomId);
    return c.json({ status: "connected", roomId, agent: bridge.agent });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Connection failed" },
      500,
    );
  }
});

app.post("/disconnect", async (c) => {
  console.log(`[API] Disconnecting`);
  if (bridge.isConnected) {
    await bridge.disconnect();
    return c.json({ status: "disconnected" });
  }
  return c.json({ status: "not_connected" });
});

app.get("/status", (c) => {
  return c.json({
    connected: bridge.isConnected,
    room: bridge.room,
    agent: bridge.agent,
  });
});

app.get("/agents", async (c) => {
  const available = await bridge.getAvailableAgents();
  return c.json({ supported: bridge.supportedAgents, available });
});

// --- Main ---

async function main() {
  if (PARTY_ROOM) {
    await bridge.connect(PARTY_ROOM);
  } else {
    console.log("Waiting for /connect request to join a room...");
  }

  console.error(`🔌 API Server running on port ${API_PORT}`);

  Bun.serve({
    port: API_PORT,
    fetch: app.fetch,
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
