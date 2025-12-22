import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAgentByName } from "agents";
import { AtlasAgent } from "./agent";
import { authenticate } from "./lib/auth";
import type { Env } from "./types";

export { AtlasAgent };

const app = new Hono<{ Bindings: Env }>();

// CORS - allow custom auth headers
app.use("*", cors({
  origin: "*",
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "X-Api-Key",
    "X-Agent-Role",
    "X-Atlas-Tier",
  ],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
}));

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok", service: "atlas-agent" }));

// Auth middleware for all agent routes
app.use("/agents/*", async (c, next) => {
  const result = await authenticate(c.req.raw, c.env);
  if (result instanceof Response) {
    return result;
  }
  // Store authenticated request for use in handlers
  c.set("authedRequest" as never, result as never);
  await next();
});

// Agent routes: /agents/atlas-agent/:userId
app.all("/agents/atlas-agent/:userId", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) {
    return c.json({ error: "Missing userId" }, 400);
  }

  const agent = await getAgentByName<Env, AtlasAgent>(c.env["atlas-agent"], userId);
  const authedRequest = c.get("authedRequest" as never) as Request;
  return agent.fetch(authedRequest);
});

// Catch-all subroutes under agent
app.all("/agents/atlas-agent/:userId/*", async (c) => {
  const userId = c.req.param("userId");
  if (!userId) {
    return c.json({ error: "Missing userId" }, 400);
  }

  const agent = await getAgentByName<Env, AtlasAgent>(c.env["atlas-agent"], userId);
  const authedRequest = c.get("authedRequest" as never) as Request;
  return agent.fetch(authedRequest);
});

// 404
app.all("*", (c) => c.json({
  error: "Not found",
  usage: { agents: "/agents/atlas-agent/:userId" },
}, 404));

export default app;
