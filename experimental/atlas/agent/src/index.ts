import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent, VoltAgent } from "@voltagent/core";
import { serverlessHono } from "@voltagent/serverless-hono";
import { Hono } from "hono";
import {
  askComputerAgentTool,
  setBroadcastCallback,
} from "./tools/ask-computer-agent";

export interface Env {
  HEYATLAS_PROVIDER_API_KEY: string;
  HEYATLAS_PROVIDER_API_URL: string;
  TRANSPORT_URL?: string;
}

const providerCache = new Map<
  string,
  ReturnType<typeof createOpenAICompatible>
>();

function getProvider(apiKey: string, apiUrl: string) {
  const cacheKey = `${apiKey}:${apiUrl}`;
  if (!providerCache.has(cacheKey)) {
    providerCache.set(
      cacheKey,
      createOpenAICompatible({
        name: "heyatlas-ai-gateway",
        apiKey,
        baseURL: apiUrl,
        includeUsage: false,
      }),
    );
  }
  return providerCache.get(cacheKey)!;
}

function createAgent(apiKey: string, apiUrl: string) {
  const provider = getProvider(apiKey, apiUrl);

  return new Agent({
    name: "atlas-assistant",
    instructions: `You are Atlas, a helpful AI assistant. You help users with various tasks and questions.

When the user asks you to perform computer tasks like:
- Browsing the web
- Writing or editing code
- File operations
- Running commands
- Any automated task

Use the ask_computer_agent tool to delegate these tasks to the computer agent.`,
    model: provider("Baseten/zai-org/GLM-4.6"),
    tools: [askComputerAgentTool],
  });
}

let defaultVoltAgent: VoltAgent | null = null;

function getDefaultVoltAgent(env: Env) {
  if (defaultVoltAgent) return defaultVoltAgent;

  const assistant = createAgent(
    env.HEYATLAS_PROVIDER_API_KEY,
    env.HEYATLAS_PROVIDER_API_URL,
  );

  defaultVoltAgent = new VoltAgent({
    agents: { assistant },
    serverless: serverlessHono(),
  });

  return defaultVoltAgent;
}

function createDynamicVoltAgent(apiKey: string, apiUrl: string) {
  const assistant = createAgent(apiKey, apiUrl);

  return new VoltAgent({
    agents: { assistant },
    serverless: serverlessHono(),
  });
}

const app = new Hono<{ Bindings: Env }>();

app.all("*", async (c) => {
  const providerApiKey = c.req.header("X-Provider-API-Key");
  const providerApiUrl = c.req.header("X-Provider-API-URL");
  const userId = c.req.header("X-User-ID");
  const roomId = c.req.header("X-Room-ID");

  // Get transport URL for broadcasting tasks
  const transportUrl = c.env.TRANSPORT_URL || "http://localhost:1999";

  // Set up broadcast callback for the tool
  if (roomId) {
    setBroadcastCallback(async (task: string, agent?: string) => {
      try {
        const response = await fetch(
          `${transportUrl}/party/${roomId}?broadcast=task`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: task,
              agent: agent || "opencode",
              source: "atlas-assistant",
            }),
          },
        );
        const result = (await response.json()) as { success: boolean };
        return result.success;
      } catch (error) {
        console.error("[Atlas Agent] Broadcast failed:", error);
        return false;
      }
    });
  } else {
    setBroadcastCallback(null);
  }

  let voltAgent: VoltAgent;

  if (providerApiKey && providerApiUrl) {
    voltAgent = createDynamicVoltAgent(providerApiKey, providerApiUrl);
    console.log(
      `[Atlas Agent] Using per-user credentials for ${userId || roomId || "unknown"}`,
    );
  } else {
    voltAgent = getDefaultVoltAgent(c.env);
    console.log(`[Atlas Agent] Using default credentials`);
  }

  const handler = voltAgent.serverless().toCloudflareWorker();
  return handler.fetch(
    c.req.raw,
    c.env as unknown as Record<string, unknown>,
    c.executionCtx,
  );
});

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
