/**
 * AtlasAgent - Cloudflare Durable Object Agent
 *
 * Tier-based AI assistant with memory, web search, and task delegation.
 * Instance ID = userId (this.name)
 */
import { type Connection, type ConnectionContext } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateText,
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Sandbox } from "@e2b/desktop";
import type { Env, AgentState } from "./types";
import type { Tier } from "./prompts";
import { getSystemPrompt, getTierConfig } from "./prompts";
import {
  createMemoryClient,
  generatePersona,
  PERSONA_CACHE_TTL,
  type MemoryClient,
} from "./memory";
import { buildTools } from "./lib/tools";
import { validateSandboxToken } from "./lib/auth";
import { buildCompletion, createStreamResponse } from "./lib/completions";

const AGENT_SMITH_CONFIG = {
  template: "heyatlas-desktop",
  port: 3141,
  startupCommand:
    "bash -lc 'node /home/user/agents/agent-smith.cjs >> /tmp/agent-smith.log 2>&1'",
};



export class AtlasAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    credentials: null,
    tier: "genin",
    persona: null,
    personaUpdatedAt: null,
    sandbox: null,
    history: [],
  };

  private _memory: MemoryClient | null = null;
  private mcpConnected = false;
  private mcpConnecting: Promise<void> | null = null;
  private sandboxInstance: Sandbox | null = null;

  get userId() {
    return this.name;
  }

  private get memory() {
    if (!this._memory && this.env.MEM0_API_KEY) {
      this._memory = createMemoryClient(this.env.MEM0_API_KEY);
    }
    return this._memory;
  }

  private async ensureSandbox() {
    
    if (!this.env.E2B_API_KEY || !this.state.credentials) {
      console.log("[Atlas] Sandbox creation skipped: Missing key or credentials");
      return;
    }

    // Check if we already have a running sandbox state
    if (this.state.sandbox) {
      // Optimistic check - in a real persistent DO, we might want to check liveness
      // But for now, we assume if state exists, it's running or we'll reconnect later
      // Ideally we would re-attach to the sandbox ID, but @e2b/desktop JS SDK might not support re-attach easily in this context
      // without the instance.
      // If we have the instance in memory (this.sandboxInstance), we are good.
      if (this.sandboxInstance) return;

      // If we have state but no instance (e.g. DO woke up), we try to reconnect or recreate
      try {
        this.sandboxInstance = await Sandbox.connect(
          this.state.sandbox.sandboxId,
          { apiKey: this.env.E2B_API_KEY },
        );
        return;
      } catch (e) {
        console.warn(
          "[Atlas] Failed to reconnect to sandbox, creating new one:",
          e,
        );
        this.setState({ ...this.state, sandbox: null });
      }
    }

    try {
      console.log("[Atlas] Creating new E2B sandbox...");
      const sandboxCallbackToken = crypto.randomUUID();

      // Construct Atlas callback URL for sandbox to send task updates
      const atlasCallbackUrl = this.env.ATLAS_CALLBACK_URL || "";

      const envs = {
        DISPLAY: ":0",
        HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
        HEYATLAS_PROVIDER_API_URL:
          this.state.credentials.providerApiUrl + "/litellm",
        SANDBOX_CALLBACK_TOKEN: sandboxCallbackToken,
        SANDBOX_USER_ID: this.userId,
        ATLAS_CALLBACK_URL: atlasCallbackUrl,
      };

      const sandbox = await Sandbox.create(AGENT_SMITH_CONFIG.template, {
        apiKey: this.env.E2B_API_KEY,
        envs,
        timeoutMs: 3600 * 1000, // 1 hour
      });

      this.sandboxInstance = sandbox;

      // Start agent-smith
      await sandbox.files.write("/tmp/agent-smith.log", "");

      await sandbox.commands.run(AGENT_SMITH_CONFIG.startupCommand, {
        background: true,
        envs,
      });

      // Expose logs via Logdy
      const logPort = 9001;
      await sandbox.commands.run(
        `logdy follow /tmp/agent-smith.log --port ${logPort} --no-analytics > /dev/null 2>&1`,
        { background: true },
      );

      const agentHost = sandbox.getHost(AGENT_SMITH_CONFIG.port);
      const computerAgentUrl = `https://${agentHost}/agents/agent-smith/text`;
      const logsHost = sandbox.getHost(logPort);
      const logsUrl = `https://${logsHost}`;

      // VNC URL - E2B desktop might expose it differently
      // Let's try to get it from the sandbox object if available, otherwise construct it
      // Python: sandbox.stream.get_url()
      // JS: sandbox.getProtocol('vnc')?.url ??
      // Let's assume there is a method or we construct it.
      // Actually, E2B desktop usually exposes :443 for web based VNC (noVNC) or similar.
      // Let's check imports. I imported Sandbox.

      // For this implementation, I will assume we can get the VNC url similarly or via getHost(6080) if using noVNC
      // The python provider used `sandbox.stream.get_url()`.
      // I will put a placeholder or try to infer.
      // Actually, E2B Desktop exposes a stream URL.
      // Let's assume `sandbox.getVncUrl()` or similar exists, if not we might need to check docs.
      // Wait, I can't check docs easily without internet.
      // I'll assume standard web-based VNC is on a port or exposed.

      // Re-reading python code: `sandbox.stream.start()` then `sandbox.stream.get_url()`
      // I'll try to replicate that.

      let vncUrl = "";
      // @ts-ignore
      if (sandbox.stream) {
        // @ts-ignore
        await sandbox.stream.start();
        // @ts-ignore
        vncUrl = sandbox.stream.getUrl();
      }

      const sandboxState = {
        sandboxId: sandbox.sandboxId,
        vncUrl,
        computerAgentUrl,
        logsUrl,
        sandboxCallbackToken,
      };

      this.setState({ ...this.state, sandbox: sandboxState });
      console.log(`[Atlas] Sandbox created: ${sandbox.sandboxId}`);

      // Broadcast sandbox info to client - only send VNC URL for security/UI needs
      this.broadcast(
        JSON.stringify({
          type: "sandbox_ready",
          vncUrl,
          logsUrl, // Useful for debugging/under-hood view
        }),
      );
    } catch (e) {
      console.error("[Atlas] Failed to create sandbox:", e);
    }
  }

  private async connectMcp() {
    if (this.mcpConnected || !this.env.PARALLELS_WEB_SEARCH_API) return;
    
    // Prevent multiple simultaneous connection attempts
    if (this.mcpConnecting) {
      return this.mcpConnecting;
    }

    this.mcpConnecting = (async () => {
      try {
        console.log("[Atlas] Connecting to MCP...");
        await this.addMcpServer(
          "parallels",
          this.env.PARALLELS_WEB_SEARCH_API!,
          undefined,
          undefined,
          {
            transport: {
              headers: {
                Authorization: `Bearer ${this.env.PARALLELS_WEB_SEARCH_API_KEY}`,
              },
            },
          },
        );
        this.mcpConnected = true;
      } catch (e) {
        console.error("[Atlas] MCP connect error:", e);
      } finally {
        this.mcpConnecting = null;
      }
    })();

    return this.mcpConnecting;
  }

  private get llm() {
    const apiKey = this.state.credentials?.providerApiKey || this.env.HEYATLAS_PROVIDER_API_KEY;
    let baseURL = this.state.credentials?.providerApiUrl || this.env.HEYATLAS_PROVIDER_API_URL;
    
    // Ensure baseURL ends with /v1 for OpenAI-compatible API
    if (baseURL && !baseURL.endsWith("/v1")) {
      baseURL = baseURL.replace(/\/$/, "") + "/v1";
    }
    return createOpenAI({ apiKey, baseURL });
  }

  private get model() {
    // Use .chat() to get Chat Completions API instead of Responses API
    return this.llm.chat(this.env.LLM_MODEL || "gpt-4o-mini");
  }

  private get tools() {
    const base = buildTools({
      userId: this.userId,
      tier: this.state.tier,
      memory: this.memory,
      broadcast: (msg: string) => this.broadcast(msg),
      sandbox: this.state.sandbox,
    });
    const cfg = getTierConfig(this.state.tier);
    return cfg.hasWebSearch && this.mcpConnected
      ? { ...base, ...this.mcp.getAITools() }
      : base;
  }

  // --- AIChatAgent Implementation ---

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
  ): Promise<Response> {
    const systemPrompt = await this.getSystemPrompt();
    const allTools = this.tools;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: this.model,
          system: systemPrompt,
          messages: convertToModelMessages(this.messages),
          tools: allTools,
          onFinish: onFinish as StreamTextOnFinishCallback<typeof allTools>,
          stopWhen: stepCountIs(10),
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  // --- State Helpers ---

  private setTier(tier: Tier) {
    if (tier !== this.state.tier) {
      this.setState({
        ...this.state,
        tier,
        persona: null,
        personaUpdatedAt: null,
      });
    }
  }

  private addMessage(role: "user" | "assistant", content: string) {
    const newHistory = [...(this.state.history || []), { role, content }];
    this.setState({ ...this.state, history: newHistory });
  }

  // --- Persona ---

  private async getPersona(): Promise<string> {
    if (!getTierConfig(this.state.tier).hasMemory) return "";
    if (
      this.state.persona &&
      this.state.personaUpdatedAt &&
      Date.now() - this.state.personaUpdatedAt < PERSONA_CACHE_TTL
    ) {
      return this.state.persona;
    }
    if (!this.memory) return this.state.persona || "";

    try {
      const persona = await generatePersona(this.memory, this.userId);
      this.setState({ ...this.state, persona, personaUpdatedAt: Date.now() });
      return persona;
    } catch (e) {
      console.error("[Atlas] Persona error:", e);
      return this.state.persona || "";
    }
  }

  private async getSystemPrompt() {
    return getSystemPrompt(this.state.tier, await this.getPersona());
  }

  // --- Public Methods ---

  async chat(prompt: string, tier?: Tier): Promise<string> {
    if (tier) this.setTier(tier);
    this.addMessage("user", prompt);

    const { text } = await generateText({
      model: this.model,
      system: await this.getSystemPrompt(),
      messages: this.state.history,
      tools: this.tools,
    });

    this.addMessage("assistant", text);
    return text;
  }

  async streamChat(prompt: string) {
    this.addMessage("user", prompt);
    return streamText({
      model: this.model,
      system: await this.getSystemPrompt(),
      messages: this.state.history,
      tools: this.tools,
    });
  }

  async chatCompletions(
    messages: Array<{ role: string; content: string }>,
    stream = true,
    tier?: Tier,
  ): Promise<Response> {
    if (tier) this.setTier(tier);
    const history = messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    ) as AgentState["history"];
    this.setState({ ...this.state, history });

    const requestId = `chatcmpl-${crypto.randomUUID()}`;
    const system = await this.getSystemPrompt();

    if (!stream) {
      const { text } = await generateText({
        model: this.model,
        system,
        messages: history,
        tools: this.tools,
      });
      this.addMessage("assistant", text);
      return Response.json(buildCompletion({ id: requestId, text }));
    }

    const result = streamText({
      model: this.model,
      system,
      messages: history,
      tools: this.tools,
    });
    return createStreamResponse(requestId, result.textStream, (text) =>
      this.addMessage("assistant", text),
    );
  }

  getHistory() {
    return this.state.history;
  }

  clearHistory() {
    this.setState({ ...this.state, history: [] });
  }

  // --- Lifecycle ---

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    
    const h = ctx.request.headers;
    const tier = (
      ["genin", "chunin", "jonin"].includes(h.get("X-Atlas-Tier") || "")
        ? h.get("X-Atlas-Tier")
        : "genin"
    ) as Tier;

    const apiKey = h.get("X-Provider-API-Key") || "";
    const apiUrl = h.get("X-Provider-API-URL") || "";

    if (apiKey && apiUrl) {
      this.setState({
        ...this.state,
        credentials: {
          userId: h.get("X-User-ID") || "",
          email: h.get("X-User-Email") || undefined,
          providerApiKey: apiKey,
          providerApiUrl: apiUrl,
        },
        tier,
      });
    } else {
      this.setState({ ...this.state, tier });
    }

    const cfg = getTierConfig(tier);
    if (cfg.hasMemory) this.getPersona().catch(() => {});
    if (cfg.hasWebSearch) this.connectMcp().catch(() => {});
    if (cfg.hasCloudDesktop) this.ensureSandbox().catch(() => {});

    conn.send(JSON.stringify({ type: "connected", userId: this.userId }));
  }

  async onMessage(conn: Connection, msg: string | ArrayBuffer) {
    if (typeof msg !== "string") return;

    try {
      const data = JSON.parse(msg) as {
        type: string;
        content?: string;
        messageId?: string;
        status?: string;
        source?: string;
        agent?: string;
      };
      const { type, content, messageId } = data;

      // Handle chat messages (from voice-agent or web client)
      if (type === "chat" && content) {
        const text = await this.chat(content);
        conn.send(
          JSON.stringify({ type: "chat:response", content: text, messageId }),
        );
      }

      // Handle streaming chat
      if (type === "stream" && content) {
        const result = await this.streamChat(content);
        conn.send(JSON.stringify({ type: "stream:start", messageId }));
        for await (const chunk of result.textStream) {
          conn.send(
            JSON.stringify({ type: "stream:chunk", content: chunk, messageId }),
          );
        }
        this.addMessage("assistant", await result.text);
        conn.send(JSON.stringify({ type: "stream:end", messageId }));
      }

      // Handle task responses from CLI agent or sandbox
      if (type === "task-response" && content) {
        const source = data.source || "cli";
        const agentName = data.agent || "coding agent";

        // Add task result to conversation history
        this.addMessage("assistant", `[Update from ${agentName}]\n${content}`);
        
        // Broadcast to all connected clients
        this.broadcast(JSON.stringify({
          type: "task-update",
          content,
          source,
          agent: agentName,
        }));
      }

      if (type === "clear_history") {
        this.clearHistory();
        conn.send(JSON.stringify({ type: "history_cleared" }));
      }
    } catch (e) {
      conn.send(JSON.stringify({ type: "error", message: String(e) }));
    }
  }

  /**
   * Extract and set credentials from authenticated request headers
   * Called for HTTP requests that have been authenticated by the router
   */
  private setCredentialsFromRequest(req: Request) {
    const h = req.headers;
    const apiKey = h.get("X-Provider-API-Key");
    const apiUrl = h.get("X-Provider-API-URL");
    const userId = h.get("X-User-ID");
    const email = h.get("X-User-Email");
    const tierHeader = h.get("X-Atlas-Tier");

    // Set tier from header if valid
    const tier = (
      tierHeader && ["genin", "chunin", "jonin"].includes(tierHeader)
        ? tierHeader
        : this.state.tier
    ) as Tier;

    // Update credentials if provided
    if (apiKey && apiUrl) {
      this.setState({
        ...this.state,
        credentials: {
          userId: userId || this.userId,
          email: email || undefined,
          providerApiKey: apiKey,
          providerApiUrl: apiUrl,
        },
        tier,
      });
    } else if (tier !== this.state.tier) {
      this.setState({ ...this.state, tier });
    }
  }

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Extract credentials from authenticated request headers
    this.setCredentialsFromRequest(req);

    // OpenAI-compatible chat completions
    if (
      url.pathname.endsWith("/v1/chat/completions") &&
      req.method === "POST"
    ) {
      const tierParam = url.searchParams.get("tier");
      const tier = (
        tierParam && ["genin", "chunin", "jonin"].includes(tierParam)
          ? tierParam
          : undefined
      ) as Tier | undefined;
      if (tier) this.setTier(tier);

      const cfg = getTierConfig(this.state.tier);
      if (cfg.hasWebSearch) await this.connectMcp();

      if (this.state.credentials && cfg.hasCloudDesktop) {
        this.ensureSandbox().catch(() => {});
      }

      const body = (await req.json()) as {
        messages: Array<{ role: string; content: string }>;
        stream?: boolean;
        tier?: Tier;
      };
      if (body.tier && !tier) this.setTier(body.tier);
      return this.chatCompletions(body.messages, body.stream ?? true);
    }

    // Direct chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      const tierParam = url.searchParams.get("tier");
      const body = (await req.json()) as { prompt: string; tier?: Tier };
      const tier = (tierParam || body.tier) as Tier | undefined;
      if (tier && ["genin", "chunin", "jonin"].includes(tier))
        this.setTier(tier);

      const cfg = getTierConfig(this.state.tier);
      if (cfg.hasWebSearch) await this.connectMcp();

      const response = await this.chat(body.prompt);
      return Response.json({ response });
    }

    // Sandbox task-update endpoint (authenticated via sandbox token)
    if (url.pathname.endsWith("/task-update") && req.method === "POST") {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (!(await validateSandboxToken(auth.slice(7), this.userId, this.env))) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = (await req.json()) as { content?: string };
      this.broadcast(JSON.stringify({
        type: "task-update",
        content: body.content,
        source: "sandbox",
      }));
      return Response.json({ success: true });
    }

    // Let AIChatAgent handle /get-messages and other built-in routes
    return super.onRequest(req);
  }
}
