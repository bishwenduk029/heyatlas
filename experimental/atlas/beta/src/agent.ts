/**
 * AtlasAgent - Cloudflare Durable Object Agent
 * 
 * Tier-based AI assistant with memory, web search, and task delegation.
 * Instance ID = userId (this.name)
 */
import { Agent, type Connection, type ConnectionContext } from "agents";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { Env, AgentState } from "./types";
import type { Tier } from "./prompts";
import { getSystemPrompt, getTierConfig } from "./prompts";
import { createMemoryClient, generatePersona, PERSONA_CACHE_TTL, type MemoryClient } from "./memory";
import { buildTools } from "./lib/tools";
import { authenticate, validateSandboxToken } from "./lib/auth";
import { buildCompletion, createStreamResponse } from "./lib/completions";

export class AtlasAgent extends Agent<Env, AgentState> {
  initialState: AgentState = {
    credentials: null,
    history: [],
    tier: "genin",
    persona: null,
    personaUpdatedAt: null,
  };

  private _memory: MemoryClient | null = null;
  private mcpConnected = false;

  get userId() { return this.name; }

  private get memory() {
    if (!this._memory && this.env.MEM0_API_KEY) {
      this._memory = createMemoryClient(this.env.MEM0_API_KEY);
    }
    return this._memory;
  }

  private async connectMcp() {
    if (this.mcpConnected || !this.env.PARALLELS_WEB_SEARCH_API) return;
    try {
      await this.addMcpServer("parallels", this.env.PARALLELS_WEB_SEARCH_API, undefined, undefined, {
        transport: { headers: { Authorization: `Bearer ${this.env.PARALLELS_WEB_SEARCH_API_KEY}` } },
      });
      this.mcpConnected = true;
    } catch (e) {
      console.error("[Atlas] MCP connect error:", e);
    }
  }

  private get llm() {
    return createOpenAI({
      apiKey: this.state.credentials?.providerApiKey || this.env.HEYATLAS_PROVIDER_API_KEY,
      baseURL: this.state.credentials?.providerApiUrl || this.env.HEYATLAS_PROVIDER_API_URL,
    });
  }

  private get model() {
    return this.llm(this.env.LLM_MODEL || "gpt-4o-mini");
  }

  private get tools() {
    const base = buildTools({ userId: this.userId, tier: this.state.tier, transportUrl: this.env.TRANSPORT_URL, memory: this.memory });
    const cfg = getTierConfig(this.state.tier);
    return cfg.hasMcp && this.mcpConnected ? { ...base, ...this.mcp.getAITools() } : base;
  }

  // --- State Helpers ---

  private setTier(tier: Tier) {
    if (tier !== this.state.tier) {
      this.setState({ ...this.state, tier, persona: null, personaUpdatedAt: null });
    }
  }

  private addMessage(role: "user" | "assistant", content: string) {
    this.setState({ ...this.state, history: [...this.state.history, { role, content }] });
  }

  // --- Persona ---

  private async getPersona(): Promise<string> {
    if (!getTierConfig(this.state.tier).hasMemory) return "";
    if (this.state.persona && this.state.personaUpdatedAt && Date.now() - this.state.personaUpdatedAt < PERSONA_CACHE_TTL) {
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
    tier?: Tier
  ): Promise<Response> {
    if (tier) this.setTier(tier);
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant") as AgentState["history"];
    this.setState({ ...this.state, history });

    const requestId = `chatcmpl-${crypto.randomUUID()}`;
    const system = await this.getSystemPrompt();

    if (!stream) {
      const { text } = await generateText({ model: this.model, system, messages: history, tools: this.tools });
      this.addMessage("assistant", text);
      return Response.json(buildCompletion({ id: requestId, text }));
    }

    const result = streamText({ model: this.model, system, messages: history, tools: this.tools });
    return createStreamResponse(requestId, result.textStream, (text) => this.addMessage("assistant", text));
  }

  getHistory() { return this.state.history; }
  clearHistory() { this.setState({ ...this.state, history: [] }); }

  // --- Lifecycle ---

  static async onBeforeConnect(request: Request, env: Env): Promise<Request | Response> {
    return authenticate(request, env);
  }

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const h = ctx.request.headers;
    const tier = (["genin", "chunin", "jonin"].includes(h.get("X-Atlas-Tier") || "") 
      ? h.get("X-Atlas-Tier") : "genin") as Tier;

    const apiKey = h.get("X-Provider-API-Key") || "";
    const apiUrl = h.get("X-Provider-API-URL") || "";
    
    if (apiKey && apiUrl) {
      this.setState({
        ...this.state,
        credentials: { userId: h.get("X-User-ID") || "", email: h.get("X-User-Email") || undefined, providerApiKey: apiKey, providerApiUrl: apiUrl },
        tier,
      });
    } else {
      this.setState({ ...this.state, tier });
    }

    const cfg = getTierConfig(tier);
    if (cfg.hasMemory) this.getPersona().catch(() => {});
    if (cfg.hasMcp) this.connectMcp().catch(() => {});

    conn.send(JSON.stringify({ type: "connected", userId: this.userId }));
  }

  async onMessage(conn: Connection, msg: string | ArrayBuffer) {
    if (typeof msg !== "string") return;
    
    try {
      const { type, content, messageId } = JSON.parse(msg) as { type: string; content?: string; messageId?: string };

      if (type === "chat" && content) {
        const text = await this.chat(content);
        conn.send(JSON.stringify({ type: "chat:response", content: text, messageId }));
      }

      if (type === "stream" && content) {
        const result = await this.streamChat(content);
        conn.send(JSON.stringify({ type: "stream:start", messageId }));
        for await (const chunk of result.textStream) {
          conn.send(JSON.stringify({ type: "stream:chunk", content: chunk, messageId }));
        }
        this.addMessage("assistant", await result.text);
        conn.send(JSON.stringify({ type: "stream:end", messageId }));
      }

      if (type === "clear_history") {
        this.clearHistory();
        conn.send(JSON.stringify({ type: "history_cleared" }));
      }
    } catch (e) {
      conn.send(JSON.stringify({ type: "error", message: String(e) }));
    }
  }

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // OpenAI-compatible chat completions
    if (url.pathname.endsWith("/v1/chat/completions") && req.method === "POST") {
      const tierParam = url.searchParams.get("tier");
      const tier = (tierParam && ["genin", "chunin", "jonin"].includes(tierParam) ? tierParam : undefined) as Tier | undefined;
      if (tier) this.setTier(tier);
      if (getTierConfig(this.state.tier).hasMcp) await this.connectMcp();

      const body = await req.json() as { messages: Array<{ role: string; content: string }>; stream?: boolean; tier?: Tier };
      if (body.tier && !tier) this.setTier(body.tier);
      return this.chatCompletions(body.messages, body.stream ?? true);
    }

    // Direct chat endpoint
    if (url.pathname === "/chat" && req.method === "POST") {
      const tierParam = url.searchParams.get("tier");
      const body = await req.json() as { prompt: string; tier?: Tier };
      const tier = (tierParam || body.tier) as Tier | undefined;
      if (tier && ["genin", "chunin", "jonin"].includes(tier)) this.setTier(tier);
      if (getTierConfig(this.state.tier).hasMcp) await this.connectMcp();

      const response = await this.chat(body.prompt);
      return Response.json({ response });
    }

    if (req.method === "GET") {
      return Response.json({ userId: this.userId, historyLength: this.state.history.length });
    }

    if (req.method === "POST") {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
      
      if (!await validateSandboxToken(auth.slice(7), this.userId, this.env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const body = await req.json() as { type: string; content?: string };
      if (body.type === "task-update") {
        this.broadcast(JSON.stringify({ type: "task-update", content: body.content, source: "sandbox" }));
        return Response.json({ success: true });
      }
      return new Response("Unknown request", { status: 400 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
}
