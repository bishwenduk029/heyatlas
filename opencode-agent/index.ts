/**
 * OpenCode Bridge - WebSocket Server
 *
 * Voice agent connects via WebSocket, sends tasks, receives responses.
 * Same pattern as Goose/Agno agents.
 */

import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "8004");
const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || "8998");

let opencodeClient: OpencodeClient | null = null;
let opencodeSessionId: string | null = null;

async function initOpencode() {
  if (opencodeClient) return opencodeClient;

  console.log("🚀 Starting OpenCode server...");
  const { client, server } = await createOpencode({
    hostname: "127.0.0.1",
    port: OPENCODE_PORT,
  });
  opencodeClient = client;
  console.log(`✅ OpenCode server running at ${server.url}`);
  return client;
}

async function initOpencodeSession() {
  if (opencodeSessionId) return opencodeSessionId;

  const client = await initOpencode();
  console.log("🔧 Creating OpenCode session...");
  const result = await client.session.create({});
  opencodeSessionId = result.data?.id || null;
  console.log(`✅ OpenCode session created: ${opencodeSessionId}`);
  return opencodeSessionId;
}

async function handleTask(taskText: string): Promise<string> {
  const sessionId = await initOpencodeSession();
  if (!sessionId || !opencodeClient) {
    throw new Error("Failed to initialize OpenCode session");
  }

  const result = await opencodeClient.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text: taskText }] },
  });

  const responseParts = result.data?.parts || [];
  console.log(responseParts);
  return responseParts
    .filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : "") || "")
    .join("\n");
}

// Initialize OpenCode on startup
await initOpencodeSession();

// WebSocket server
Bun.serve({
  port: BRIDGE_PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade on /ws
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", sessionId: opencodeSessionId });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log("🔌 Client connected");
    },
    async message(ws, message) {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "message") {
          const taskText = data.content;
          console.log(`📥 Task: ${taskText.substring(0, 100)}...`);

          const responseText = await handleTask(taskText);

          ws.send(JSON.stringify({ type: "response", content: responseText }));
          console.log(`📤 Response sent`);
        }
      } catch (error) {
        console.error("❌ Error:", error);
        ws.send(
          JSON.stringify({
            type: "response",
            content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          }),
        );
      }
    },
    close(ws) {
      console.log("📴 Client disconnected");
    },
  },
});

console.log(`🌉 OpenCode Bridge ready on port ${BRIDGE_PORT}`);
console.log(`   WebSocket: ws://localhost:${BRIDGE_PORT}/ws`);
