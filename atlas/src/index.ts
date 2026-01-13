import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAgentByName } from "agents";
import { AtlasAgent } from "./agent";
import { authenticate, validateSandboxToken, type AuthData } from "./lib/auth";
import type { Env } from "./types";
import type { Tier } from "./prompts";

// Export Durable Objects
export { AtlasAgent };
// Re-export Sandbox from Cloudflare SDK for Durable Object registration
export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

// CORS - allow custom auth headers
app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization", "X-Api-Key", "X-Agent-Role", "X-Atlas-Tier"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
}));

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok", service: "atlas-agent" }));

// Auth middleware for all agent routes
app.use("/agents/*", async (c, next) => {
  const result = await authenticate(c.req.raw, c.env);
  if (result instanceof Response) return result;
  c.set("auth" as never, result as never);
  await next();
});

// Helper to get authenticated agent
async function getAgent(c: { env: Env; get: (key: string) => unknown }, userId: string) {
  const agent = await getAgentByName<Env, AtlasAgent>(c.env["atlas-agent"], userId);
  const auth = c.get("auth") as AuthData;
  agent.setCredentials(auth);
  return agent;
}

// OpenAI-compatible chat completions endpoint
app.post("/agents/atlas-agent/:userId/v1/chat/completions", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);
  const body = await c.req.json<{
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    tier?: Tier;
  }>();

  const tier = (c.req.query("tier") || body.tier) as Tier | undefined;
  return agent.handleChatCompletions(body.messages, body.stream ?? true, tier);
});

// Direct chat endpoint
app.post("/agents/atlas-agent/:userId/chat", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);
  const body = await c.req.json<{ prompt: string; tier?: Tier }>();
  const tier = (c.req.query("tier") || body.tier) as Tier | undefined;
  
  const response = await agent.handleChat(body.prompt, tier);
  return c.json({ response });
});

// Sandbox task-update endpoint
app.post("/agents/atlas-agent/:userId/task-update", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ") || !(await validateSandboxToken(auth.slice(7), userId, c.env))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const agent = await getAgentByName<Env, AtlasAgent>(c.env["atlas-agent"], userId);
  const body = await c.req.json<{ content?: string }>();
  
  agent.broadcast(JSON.stringify({ type: "task-update", content: body.content, source: "sandbox" }));
  return c.json({ success: true });
});

// Connect cloud agent endpoint (called from Next.js API route)
// This keeps API keys server-side only
app.post("/agents/:userId/connect-cloud-agent", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);
  const body = await c.req.json<{ agentId: string; apiKey?: string }>();
  
  if (!body.agentId) {
    return c.json({ success: false, error: "Missing agentId" }, 400);
  }

  try {
    const result = await agent.connectCloudAgentHTTP(body.agentId, body.apiKey);
    return c.json(result);
  } catch (error) {
    console.error("[connect-cloud-agent] Error:", error);
    return c.json({ success: false, error: "Failed to connect cloud agent" }, 500);
  }
});

// Disconnect agent endpoint - destroys sandbox and clears agent state
app.post("/agents/:userId/disconnect-agent", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);

  try {
    const result = await agent.disconnectAgent();
    return c.json(result);
  } catch (error) {
    console.error("[disconnect-agent] Error:", error);
    return c.json({ success: false, error: "Failed to disconnect agent" }, 500);
  }
});

// WebSocket upgrade and built-in routes (get-messages, etc.)
app.all("/agents/atlas-agent/:userId", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);
  return agent.fetch(c.req.raw);
});

// Catch-all for other subroutes
app.all("/agents/atlas-agent/:userId/*", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const agent = await getAgent(c, userId);
  return agent.fetch(c.req.raw);
});

// 404
app.all("*", (c) => c.json({
  error: "Not found",
}, 404));

export default app;
