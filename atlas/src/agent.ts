/**
 * AtlasAgent - Cloudflare Durable Object Agent
 *
 * Tier-based AI assistant with web search and task delegation.
 * Memory is handled via CF_AGENT_STATE (implicit state sync).
 * Instance ID = userId (this.name)
 */
import { callable, type Connection, type ConnectionContext } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  streamText,
  generateText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Sandbox } from "@e2b/desktop";
import type { Env, AgentState, Task } from "./types";
import type { Tier } from "./prompts";
import { getSystemPrompt, getTierConfig } from "./prompts";
import { buildTools } from "./lib/tools";
import { createStreamResponse } from "./lib/completions";

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
    tasks: {},
    connectedAgentId: null,
    interactiveMode: false,
    interactiveTaskId: null,
    systemPrompt: null,
    userSection: null,
    compressing: false,
  };
  private sandboxInstance: Sandbox | null = null;

  get userId() {
    return this.name;
  }

  private async ensureSandbox() {
    if (!this.env.E2B_API_KEY || !this.state.credentials) {
      console.log(
        "[Atlas] Sandbox creation skipped: Missing key or credentials",
      );
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

  private mcpInitialized = false;

  private async buildMCPServers() {
    // Prevent re-initialization
    if (this.mcpInitialized) {
      return;
    }

    const searchMcpServerResponse = await this.addMcpServer("Web Search", this.env.PARALLELS_WEB_SEARCH_API || "", undefined, undefined, {
      transport: {
        type: "streamable-http",
        headers: {
          authorization: `Bearer ${this.env.PARALLELS_WEB_SEARCH_API_KEY || ""}`,
        },
      },
    });
    if (searchMcpServerResponse.state !== "ready") {
      console.warn(`[Atlas] MCP Server requires authentication:`, searchMcpServerResponse.authUrl);
    }

    this.mcpInitialized = true;
  }

  private get llm() {
    const apiKey = this.state.credentials?.providerApiKey;
    let baseURL =
      this.state.credentials?.providerApiUrl ||
      this.env.HEYATLAS_PROVIDER_API_URL;

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
    return buildTools({
      userId: this.userId,
      tier: this.state.tier,
      broadcast: (msg: string) => this.broadcast(msg),
      sandbox: this.state.sandbox,
      askLocalComputerAgent: (description, existingTaskId) =>
        this.askLocalComputerAgent(description, existingTaskId),
      getTask: (taskId) => this.getTask(taskId),
      listTasks: () => this.listTasks(),
      deleteTask: (taskId) => this.deleteTask(taskId),
      updateUserContext: (userSection: string) =>
        this.updateUserSection(userSection),
    });
  }

  // --- Task Management ---

  askLocalComputerAgent(task: string, existingTaskId?: string): string {
    if (existingTaskId) {
      this.updateTask(existingTaskId, task);
      return `Updated existing task ${existingTaskId} with new instructions.`;
    }

    const newTask = this.createTask(task);
    return `Created new task ${newTask.id} for local computer agent.`;
  }

  createTask(description: string): Task {
    const currentTasks = this.state.tasks || {};

    console.log(
      `[Atlas] createTask: interactive=${this.state.interactiveMode}, existingTaskId=${this.state.interactiveTaskId?.slice(0, 8) || "none"}`,
    );

    // Create new task with "new" state - CLI will pick this up
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      description,
      state: "new",
      context: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.setState({
      ...this.state,
      tasks: { ...currentTasks, [id]: task },
    });
    return task;
  }

  updateTask(taskId: string, newInput: string): Task | null {
    const currentTasks = this.state.tasks || {};
    const task = currentTasks[taskId];
    if (!task) return null;

    // Add new input to context and set state to "continue" - CLI will pick this up
    const updatedTask: Task = {
      ...task,
      state: "continue",
      context: [...task.context, { role: "user", content: newInput }],
      updatedAt: Date.now(),
    };

    // State update auto-syncs to all clients via CF_AGENT_STATE
    this.setState({
      ...this.state,
      tasks: { ...currentTasks, [taskId]: updatedTask },
    });
    return updatedTask;
  }

  getTask(taskId: string): Task | null {
    const tasks = this.state.tasks || {};
    // Direct match
    if (tasks[taskId]) return tasks[taskId];
    // Partial match (first 8 chars)
    const match = Object.values(tasks).find((t) => t.id.startsWith(taskId));
    return match || null;
  }

  listTasks(): Task[] {
    return Object.values(this.state.tasks || {});
  }

  deleteTask(taskId: string): boolean {
    const currentTasks = this.state.tasks || {};
    if (!currentTasks[taskId]) {
      // Try partial match (first 8 chars)
      const match = Object.keys(currentTasks).find((id) =>
        id.startsWith(taskId),
      );
      if (!match) return false;
      taskId = match;
    }

    const { [taskId]: deleted, ...remainingTasks } = currentTasks;
    this.setState({
      ...this.state,
      tasks: remainingTasks,
    });
    return true;
  }

  @callable({ description: "Update task by ID" })
  async updateTaskFromClient(task: Task): Promise<void> {
    const currentTasks = this.state.tasks || {};
    if (!currentTasks[task.id]) return;

    this.setState({
      ...this.state,
      tasks: { ...currentTasks, [task.id]: task },
    });
  }

  private updateUserSection(userSection: string): void {
    this.setState({ ...this.state, userSection });
  }

  // --- AIChatAgent Implementation ---

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
  ): Promise<Response> {
    const systemPrompt = await this.getSystemPrompt();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: this.model,
          system: systemPrompt,
          messages: await this.prepareModelMessages(),
          tools: { ...this.tools,  ...this.mcp.getAITools() },
          onFinish: async (event) => {
            // Call original onFinish
            await (onFinish as StreamTextOnFinishCallback<typeof this.tools>)(
              event,
            );
          },
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
      });
    }
  }

  private addMessage(role: "user" | "assistant", content: string) {
    this.messages.push({
      id: crypto.randomUUID(),
      role,
      parts: [{ type: "text", text: content }],
    });
  }

  private async getSystemPrompt() {
    let systemPrompt = this.state.systemPrompt;

    if (!systemPrompt) {
      systemPrompt = getSystemPrompt(this.state.tier);
      this.setState({ ...this.state, systemPrompt });
    }

    if (this.state.userSection) {
      systemPrompt = `${systemPrompt}\n\n<userContext>\n${this.state.userSection}\n</userContext>`;
    }

    return systemPrompt;
  }

  private async prepareModelMessages() {
    if (this.messages.length <= 50) {
      return convertToModelMessages(this.messages);
    }
    this.setState({ ...this.state, compressing: true });

    const keepCount = 15;
    const summarizeCount = this.messages.length - keepCount;
    const messagesToSummarize = this.messages.slice(0, summarizeCount);
    const remainingMessages = this.messages.slice(summarizeCount);

    const summaryPrompt = `You are Atlas an AI assistant. Summarize the following conversation from your perspective (first person), starting with "I had a conversation where...". Preserve all important context, decisions made, and relevant information that would help you continue the conversation naturally without loosing any context.

Conversation to summarize:
${messagesToSummarize.map((m) => `[${m.role.toUpperCase()}]: ${m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}`).join("\n\n")}

Write your first-person summary:`;
    const { text } = await generateText({
      model: this.model,
      messages: [{ role: "user", content: summaryPrompt }],
      toolChoice: "none",
    });

    const summaryMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text" as const, text }],
    };

    // Clear all messages from DB first (persistMessages only upserts, doesn't delete)
    // In future we can maintain an achive table to push summarized messages into it. The archive table can also have a semantic indexing
    this.sql`delete from cf_ai_chat_agent_messages`;

    // Persist new messages (persistMessages will reload this.messages from DB)
    await this.persistMessages([summaryMessage, ...remainingMessages]);

    this.setState({ ...this.state, compressing: false });

    return convertToModelMessages(this.messages);
  }

  // --- Public Methods ---

  async chat(prompt: string, tier?: Tier): Promise<string> {
    if (tier) this.setTier(tier);
    console.log("[Atlas] Chat prompt received", prompt);
    this.addMessage("user", prompt);

    let responseText = "";
    await this.onChatMessage(async (event) => {
      if (event.text) {
        responseText = event.text;
        this.addMessage("assistant", event.text);
        await this.persistMessages(this.messages);
      }
    });

    return responseText;
  }

  async streamChat(prompt: string): Promise<Response> {
    this.addMessage("user", prompt);

    return this.onChatMessage(async (event) => {
      if (event.text) {
        this.addMessage("assistant", event.text);
        await this.persistMessages(this.messages);
      }
    });
  }

  async chatCompletions(
    messages: Array<{ role: string; content: string }>,
    stream = true,
    tier?: Tier,
  ): Promise<Response> {
    if (tier) this.setTier(tier);

    const requestId = `chatcmpl-${crypto.randomUUID()}`;
    const voiceMessages = [messages[messages.length - 1]].map((msg) => ({
      id: crypto.randomUUID(),
      role: msg.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: msg.content }],
    }));

    // Add the voice messages to our conversation
    for (const msg of voiceMessages) {
      this.messages.push(msg);
    }

    // Streaming: use the existing createStreamResponse with AI SDK streaming
    const { textStream } = streamText({
      model: this.model,
      system: await this.getSystemPrompt(),
      messages: await this.prepareModelMessages(),
      tools: { ...this.tools,  ...this.mcp.getAITools() },
      stopWhen: stepCountIs(10),
      onFinish: async (event) => {
        if (event.text) {
          this.addMessage("assistant", event.text);
          await this.persistMessages(this.messages);
        }
      },
    });

    return createStreamResponse(requestId, textStream, (text) => {
      // Text completion is already handled in the streamText onFinish callback
      // This callback is required by createStreamResponse but we don't need additional logic here
    });
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

    // Capture connected agent ID and mode from headers if present (sent by CLI)
    const connectedAgentId = h.get("X-Agent-Id");
    const interactiveMode = h.get("X-Interactive-Mode") === "true";
    console.log(
      `[Atlas] onConnect - connectedAgentId header: ${connectedAgentId}, existing state: ${this.state.connectedAgentId}`,
    );
    if (connectedAgentId) {
      this.setState({
        ...this.state,
        connectedAgentId,
        interactiveMode,
        // Reset interactive task when switching modes or starting fresh interactive session
        interactiveTaskId: interactiveMode
          ? this.state.interactiveTaskId
          : null,
      });
      console.log(
        `[Atlas] Connected agent: ${connectedAgentId}${interactiveMode ? " (interactive)" : ""}`,
      );
    } else if (this.state.interactiveMode) {
      // Reset interactive mode if no agent ID header (non-CLI connection)
      this.setState({
        ...this.state,
        interactiveMode: false,
        interactiveTaskId: null,
      });
    } else if (!connectedAgentId && this.state.connectedAgentId) {
      // If web client connects but CLI is still connected, preserve connectedAgentId
      console.log(
        `[Atlas] Web client connected while CLI agent still connected: ${this.state.connectedAgentId}`,
      );
    }

    const cfg = getTierConfig(tier);
    if (cfg.hasCloudDesktop) this.ensureSandbox().catch(() => { });

    await this.buildMCPServers();

    conn.send(JSON.stringify({ type: "connected", userId: this.userId }));
  }

  /**
   * Hook called when state is updated (from server or client).
   */
  onStateUpdate(state: AgentState, source: "server" | Connection) {
    const sourceType = source === "server" ? "server" : "client";
    const taskCount = Object.keys(state.tasks || {}).length;
    console.log(`[Atlas] onStateUpdate [${sourceType}]: tasks=${taskCount}`);

    // Log task states for debugging
    if (state.tasks) {
      for (const [taskId, task] of Object.entries(state.tasks)) {
        console.log(
          `  - Task ${taskId.slice(0, 8)}: ${task.state}, context=${task.context?.length || 0}`,
        );
      }
    }
  }

  // --- Public API (called from Hono router) ---

  /**
   * Set credentials from auth data
   */
  setCredentials(auth: {
    userId: string;
    email: string;
    apiKey: string;
    apiUrl: string;
    tier: string;
  }) {
    const tier = (
      ["genin", "chunin", "jonin"].includes(auth.tier)
        ? auth.tier
        : this.state.tier
    ) as Tier;

    if (auth.apiKey && auth.apiUrl) {
      this.setState({
        ...this.state,
        credentials: {
          userId: auth.userId || this.userId,
          email: auth.email || undefined,
          providerApiKey: auth.apiKey,
          providerApiUrl: auth.apiUrl,
        },
        tier,
      });
    } else if (tier !== this.state.tier) {
      this.setState({ ...this.state, tier });
    }
  }

  /**
   * Handle OpenAI-compatible chat completions (called from Hono router)
   */
  async handleChatCompletions(
    messages: Array<{ role: string; content: string }>,
    stream = true,
    tier?: Tier,
  ): Promise<Response> {
    if (tier) this.setTier(tier);

    const cfg = getTierConfig(this.state.tier);
    if (this.state.credentials && cfg.hasCloudDesktop) {
      this.ensureSandbox().catch(() => { });
    }

    // Ensure MCP servers are initialized for HTTP requests (voice mode)
    await this.buildMCPServers();

    return this.chatCompletions(messages, stream, tier);
  }

  /**
   * Handle direct chat endpoint (called from Hono router)
   */
  async handleChat(prompt: string, tier?: Tier): Promise<string> {
    if (tier && ["genin", "chunin", "jonin"].includes(tier)) {
      this.setTier(tier);
    }

    const cfg = getTierConfig(this.state.tier);

    return this.chat(prompt);
  }

  /**
   * Send voice update to connected voice agent
   * Called when completion events arrive from CLI agents
   */
  @callable()
  update_human(summary: string): void {
    this.broadcast(
      JSON.stringify({
        type: "voice_update",
        summary,
      }),
    );
  }

  /**
   * Broadcast ephemeral task event to UI without storing in task.context.
   * Used for tool calls, thinking indicators, status updates, etc.
   */
  @callable({ description: "Broadcast ephemeral task event to UI" })
  broadcast_task_event(taskId: string, event: { type: string; timestamp: number; data: Record<string, unknown> }): void {
    this.broadcast(
      JSON.stringify({
        type: "task_event",
        taskId,
        event,
        timestamp: Date.now(),
      }),
    );
  }

  speak_with_human(response: string): void {
    this.broadcast(
      JSON.stringify({
        type: "speak",
        response,
      }),
    );
  }

  /**
   * Handle built-in routes (get-messages, WebSocket upgrades, etc.)
   */
  async onRequest(req: Request): Promise<Response> {
    return super.onRequest(req);
  }
}
