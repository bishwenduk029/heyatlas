import { routeAgentRequest, getAgentByName } from "agents";
import { AtlasAgent } from "./agent";
import type { Env } from "./types";

export { AtlasAgent };

import type { Tier } from "./prompts";

interface ChatCompletionRequest {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  tier?: Tier;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "atlas-agent" });
    }

    // OpenAI-compatible: POST /:userId/v1/chat/completions
    // Routes through agent.fetch() -> onRequest for proper MCP connection
    const openaiMatch = url.pathname.match(/^\/([^/]+)\/v1\/chat\/completions$/);
    if (openaiMatch && request.method === "POST") {
      const userId = openaiMatch[1];
      const agent = await getAgentByName<Env, AtlasAgent>(env["atlas-agent"], userId);
      const agentUrl = new URL(`/v1/chat/completions${url.search}`, request.url);
      return agent.fetch(new Request(agentUrl, request));
    }

    // Direct chat API: POST /chat/:userId
    // Routes through agent.fetch() -> onRequest for proper MCP connection
    const chatMatch = url.pathname.match(/^\/chat\/([^/]+)/);
    if (chatMatch && request.method === "POST") {
      const userId = chatMatch[1];
      const agent = await getAgentByName<Env, AtlasAgent>(env["atlas-agent"], userId);
      const agentUrl = new URL(`/chat${url.search}`, request.url);
      return agent.fetch(new Request(agentUrl, request));
    }

    // WebSocket / HTTP: /agent/:userId
    const agentMatch = url.pathname.match(/^\/agent\/([^/]+)/);
    if (agentMatch) {
      const userId = agentMatch[1];
      const agent = await getAgentByName<Env, AtlasAgent>(
        env["atlas-agent"],
        userId,
      );
      return agent.fetch(request);
    }

    // Auto routing: /agents/atlas-agent/:userId
    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;

    return Response.json(
      {
        error: "Not found",
        usage: {
          openai: "POST /:userId/v1/chat/completions (OpenAI-compatible)",
          chat: "POST /chat/:userId { prompt: string }",
          websocket: "GET /agent/:userId (WebSocket upgrade)",
        },
      },
      { status: 404 },
    );
  },
};
