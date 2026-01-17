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
  tool,
  type StreamTextOnFinishCallback,
  type ToolSet,
  UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Sandbox } from "@e2b/desktop";
import type { Env, AgentState, Task, SelectedAgent, SandboxMetadata, ChatMessage, FileAttachment } from "./types";
import type { Tier } from "./prompts";
import { getSystemPrompt, getTierConfig } from "./prompts";
import { buildTools, generateImageTool } from "./lib/tools";
import { createStreamResponse } from "./lib/completions";
import { createFSTools, type CloudflareStorage } from "./lib/agentfs";
import {
  createCloudflareSandbox,
  connectAgentInSandbox,
  destroyCloudflareSandbox,
  exposeSandboxPort,
} from "./lib/cloudflare-sandbox";

const SMITH_CONFIG = {
  template: "heyatlas-desktop",
  port: 3030,
  startupCommand:
    "bash -lc 'npx heyatlas connect smith --no-browser'",
};

export class AtlasAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    credentials: null,
    tier: "genin",
    persona: null,
    personaUpdatedAt: null,
    sandbox: null,
    miniComputer: null,
    tasks: {},
    activeAgent: null,
    interactiveMode: false,
    interactiveTaskId: null,
    systemPrompt: null,
    userSection: null,
    compressing: false,
    learnings: [],
    sharedHistory: [],
  };
  private sandboxInstance: Sandbox | null = null;

  /**
   * Clean legacy fields from state before setting.
   * The DO may have persisted old fields that are no longer in the schema.
   */
  private cleanState(state: AgentState): AgentState {
    const clean = { ...state };
    // Remove legacy fields that may be persisted in DO state
    const legacyFields = ["selectedAgent", "cloudflareSandbox", "connectedAgentId"];
    for (const field of legacyFields) {
      if (field in clean) {
        delete (clean as Record<string, unknown>)[field];
      }
    }
    return clean;
  }

  get userId() {
    return this.name;
  }

  private async ensureSandbox() {
    if (!this.env.E2B_API_KEY || !this.state.credentials) {
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
      const sandboxCallbackToken = crypto.randomUUID();

      // Construct Atlas callback URL for sandbox to send task updates
      const atlasCallbackUrl = this.env.ATLAS_CALLBACK_URL || "";

      const envs = {
        DISPLAY: ":0",
        // For smith (AI gateway)
        HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
        HEYATLAS_PROVIDER_API_URL:
          this.state.credentials.providerApiUrl + "/litellm",
        // For heyatlas CLI auth
        HEYATLAS_ACCESS_TOKEN: this.state.credentials.atlasAccessToken || "",
        HEYATLAS_USER_ID: this.userId,
        ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "agent.heyatlas.app",
      };

      const sandbox = await Sandbox.create(SMITH_CONFIG.template, {
        apiKey: this.env.E2B_API_KEY,
        envs,
        timeoutMs: 3600 * 1000, // 1 hour
      });

      this.sandboxInstance = sandbox;

      // Start smith (volt-agent)
      await sandbox.commands.run(SMITH_CONFIG.startupCommand, {
        background: true,
        envs,
      });

      const agentHost = sandbox.getHost(SMITH_CONFIG.port);
      const computerAgentUrl = `https://${agentHost}/agents/workflow-orchestrator/chat`;

      let vncUrl = "";
      // @ts-ignore
      if (sandbox.stream) {
        // @ts-ignore
        await sandbox.stream.start();
        // @ts-ignore
        vncUrl = sandbox.stream.getUrl();
      }

      const sandboxState: SandboxMetadata = {
        type: "e2b",
        sandboxId: sandbox.sandboxId,
        vncUrl,
        computerAgentUrl,
      };

      this.setState({ ...this.state, sandbox: sandboxState });

      // Broadcast sandbox info to client
      this.broadcast(
        JSON.stringify({
          type: "sandbox_ready",
          vncUrl,
        }),
      );
    } catch (e) {
      console.error("[Atlas] Failed to create sandbox:", e);
    }
  }

  private mcpAdding = false;

  private async buildMCPServers() {
    const url = this.env.PARALLELS_WEB_SEARCH_API;
    if (!url || this.mcpAdding) return;

    // Check if MCP is available (may not be initialized yet)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcp = (this as any).mcp;
    if (!mcp || typeof mcp.getMcpServers !== "function") {
      return;
    }

    // Check if already connected (persisted in storage)
    const { servers } = this.getMcpServers();
    if (Object.values(servers).find((s) => s.name === "Web Search")) return;

    this.mcpAdding = true;
    try {
      const response = await this.addMcpServer("Web Search", url, undefined, undefined, {
        transport: {
          type: "streamable-http",
          headers: { authorization: `Bearer ${this.env.PARALLELS_WEB_SEARCH_API_KEY || ""}` },
        },
      });
      if (response.state !== "ready") {
        console.warn("[Atlas] MCP requires auth:", response.authUrl);
      }
    } catch (e) {
      console.error("[Atlas] MCP init failed:", e);
    } finally {
      this.mcpAdding = false;
    }
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
      convertFileToMarkdown: (file) => this.convertFileToMarkdown(file),
      // Learnings & Shared History
      saveLearning: (content: string) => this.saveLearning(content),
      getLearnings: () => this.getLearnings(),
      forgetLearning: (content: string) => this.forgetLearning(content),
      addToOurStory: (moment: string) => this.addToOurStory(moment),
      getOurStory: () => this.getOurStory(),
    });
  }

  private async getAllTools() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (this as any).ctx?.storage as CloudflareStorage | undefined;
    const fsTools = storage ? await createFSTools(storage) : {};

    // MCP tools may not be initialized yet - safely try to get them
    let mcpTools = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcp = (this as any).mcp;
      if (mcp && typeof mcp.getAITools === "function") {
        mcpTools = mcp.getAITools();
      }
    } catch {
      // MCP not ready yet, continue without
    }

    return { ...this.tools, ...mcpTools, ...fsTools };
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

  async createTaskWithSandbox(
    description: string,
    selectedAgent: SelectedAgent,
  ): Promise<Task> {
    const currentTasks = this.state.tasks || {};

    // If remote agent selected, create Cloudflare sandbox first
    if (selectedAgent.type === "cloud" && this.state.credentials) {
      const agentId = selectedAgent.agentId;
      try {
        const { sandboxId, sessionId } = await createCloudflareSandbox(
          this.env.Sandbox,
          { idleTimeout: 600000 },
        );

        // Build environment variables for the agent
        const envVars: Record<string, string> = {
          HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
          HEYATLAS_PROVIDER_API_URL: this.state.credentials.providerApiUrl,
          ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "localhost:8787",
        };

        // Agent-specific configuration
        if (agentId === "goose" || agentId === "opencode") {
          envVars.GOOSE_PROVIDER = "litellm";
          envVars.GOOSE_MODEL = this.env.LLM_MODEL || "gpt-4o-mini";
        }

        const connected = await connectAgentInSandbox(
          this.env.Sandbox,
          sandboxId,
          sessionId,
          agentId,
          envVars,
          {
            token:
              this.state.credentials.atlasAccessToken ||
              this.state.credentials.providerApiKey,
            userId: this.state.credentials.userId,
            email: this.state.credentials.email,
          },
        );

        // Store Cloudflare sandbox state at agent level (no VNC - terminal only)
        this.setState(this.cleanState({
          ...this.state,
          sandbox: {
            type: "cloudflare",
            sandboxId,
            sessionId,
            agentConnected: connected,
          },
          activeAgent: connected ? agentId : null,
        }));

        // Broadcast sandbox ready (no VNC for Cloudflare Sandbox)
        this.broadcast(
          JSON.stringify({
            type: "sandbox_ready",
            sandboxId,
            sessionId,
            agentId,
          }),
        );
      } catch (e) {
        console.error("[Atlas] Failed to create Cloudflare sandbox:", e);
        this.setState(this.cleanState({ ...this.state }));
      }
    } else {
      // Local agent - just set active agent to null
      this.setState(this.cleanState({
        ...this.state,
        activeAgent: null,
      }));
    }

    // Create the task
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      agentId:
        selectedAgent.type === "cloud" ? selectedAgent.agentId : undefined,
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

  createTask(description: string): Task {
    const currentTasks = this.state.tasks || {};

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

  // --- Learnings ---

  saveLearning(content: string): void {
    const learnings = [...(this.state.learnings || [])];
    if (!learnings.includes(content)) {
      learnings.push(content);
      this.setState({ ...this.state, learnings });
    }
  }

  getLearnings(): string[] {
    return this.state.learnings || [];
  }

  forgetLearning(content: string): boolean {
    const learnings = this.state.learnings || [];
    const idx = learnings.findIndex((l) => l.toLowerCase().includes(content.toLowerCase()));
    if (idx === -1) return false;
    this.setState({
      ...this.state,
      learnings: learnings.filter((_, i) => i !== idx),
    });
    return true;
  }

  addToOurStory(moment: string): void {
    const history = [...(this.state.sharedHistory || [])];
    history.push(moment);
    this.setState({ ...this.state, sharedHistory: history });
  }

  getOurStory(): string[] {
    return this.state.sharedHistory || [];
  }

  @callable({ description: "Select or connect a coding agent (local or cloud)" })
  async selectAgent(
    agent: SelectedAgent,
    apiKey?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Destroy previous cloud sandbox if switching agents
    if (this.state.sandbox?.type === "cloudflare") {
      const prevAgentId = this.state.activeAgent;
      const newAgentId = agent.type === "cloud" ? agent.agentId : "local";

      if (prevAgentId && prevAgentId !== newAgentId) {
        await destroyCloudflareSandbox(
          this.env.Sandbox,
          this.state.sandbox.sandboxId,
        );
        // Add delay to ensure cleanup propagates to prevent zombie instances
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Handle local agent selection
    if (agent.type === "local") {
      this.setState(this.cleanState({
        ...this.state,
        sandbox: null,
        activeAgent: null,
      }));
      return { success: true };
    }

    // Handle cloud agent connection
    if (agent.type === "cloud") {
      if (!this.state.credentials) {
        return { success: false, error: "No credentials available" };
      }

      try {
        const agentId = agent.agentId;

        // Create Cloudflare sandbox
        const { sandboxId, sessionId } = await createCloudflareSandbox(
          this.env.Sandbox,
          { idleTimeout: 600000 },
        );

        // Build environment variables - API key is passed directly to sandbox, never stored
        const envVars: Record<string, string> = {
          HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
          HEYATLAS_PROVIDER_API_URL: this.state.credentials.providerApiUrl,
          ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "localhost:8787",
        };

        // Agent-specific configuration
        if (agentId === "goose" || agentId === "opencode") {
          envVars.GOOSE_PROVIDER = "litellm";
          envVars.GOOSE_MODEL = this.env.LLM_MODEL || "gpt-4o-mini";
        }

        // Add user's API key for agents that require it
        if (apiKey) {
          const agentApiKeyEnvVars: Record<string, string> = {
            "claude-code": "ANTHROPIC_API_KEY",
            manus: "MANUS_API_KEY",
            v0: "V0_API_KEY",
          };
          const envVarName = agentApiKeyEnvVars[agentId];
          if (envVarName) {
            envVars[envVarName] = apiKey;
          }
        }

        // Connect agent in sandbox with credentials for CLI auth
        const connected = await connectAgentInSandbox(
          this.env.Sandbox,
          sandboxId,
          sessionId,
          agentId,
          envVars,
          {
            token: this.state.credentials.atlasAccessToken || "",
            userId: this.state.credentials.userId,
            email: this.state.credentials.email,
          },
        );

        this.setState(this.cleanState({
          ...this.state,
          sandbox: {
            type: "cloudflare",
            sandboxId,
            sessionId,
            agentConnected: connected,
          },
          activeAgent: agentId,
        }));

        // Broadcast sandbox ready
        this.broadcast(
          JSON.stringify({
            type: "sandbox_ready",
            sandboxId,
            sessionId,
            agentId,
          }),
        );

        return { success: connected };
      } catch (e) {
        console.error("[Atlas] Failed to connect cloud agent:", e);
        return {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        };
      }
    }

    return { success: false, error: "Invalid agent type" };
  }

  /**
   * HTTP-accessible version of selectAgent for cloud agents
   * Called from Next.js API route via Hono endpoint
   * This keeps API keys server-side only (never exposed to browser)
   */
  async connectCloudAgentHTTP(
    agentId: string,
    apiKey?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.selectAgent({ type: "cloud", agentId }, apiKey);
  }

  /**
   * Disconnect current agent - destroys sandbox and clears agent state
   * Called from Next.js API route via Hono endpoint
   */
  async disconnectAgent(): Promise<{ success: boolean; error?: string }> {
    // Destroy existing sandbox if any
    if (this.state.sandbox?.type === "cloudflare" && this.state.sandbox.sandboxId) {
      await destroyCloudflareSandbox(
        this.env.Sandbox,
        this.state.sandbox.sandboxId,
      );
      // Add delay to ensure cleanup propagates
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Clear state
    this.setState(this.cleanState({
      ...this.state,
      sandbox: null,
      activeAgent: null,
    }));

    return { success: true };
  }

  @callable({ description: "Get current active agent" })
  getActiveAgent(): string | null {
    return this.state.activeAgent;
  }

  // --- AIChatAgent Implementation ---

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
  ): Promise<Response> {
    const systemPrompt = await this.getSystemPrompt();
    const allTools = await this.getAllTools();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: this.model,
          system: systemPrompt,
          messages: await this.prepareModelMessages({
            "generateImage": generateImageTool((prompt) => this.generateImage(prompt))
          }),
          tools: {
            ...allTools,
            generateImage: generateImageTool((prompt) => this.generateImage(prompt))
          },
          onFinish: async (event) => {
            // Call original onFinish - caller handles adding message
            // Cast event through unknown to satisfy ToolSet generic
            await onFinish(event as unknown as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]);
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

  // Flatten a message's parts into a single text part (URLs embedded)
  // Works with UIMessage from base class (parts may have url field from file uploads)
  private flattenMessage<T extends { parts?: Array<{ type: string; text?: string; url?: string; [key: string]: unknown }> }>(msg: T): T {
    const textParts: string[] = [];
    const fileUrls: string[] = [];

    for (const part of msg.parts || []) {
      if (part.type === "text" && part.text) {
        textParts.push(part.text);
      } else if (part.type === "file" && part.url) {
        fileUrls.push(part.url);
      }
    }

    let combinedText = textParts.join("\n");
    if (fileUrls.length > 0) {
      combinedText = `${combinedText}\n\nAttached files: ${fileUrls.join(", ")}`;
    }

    return {
      ...msg,
      parts: [{ type: "text" as const, text: combinedText }],
    };
  }



  private async addMessage(
    role: "user" | "assistant",
    content: string,
    files?: Array<{ url: string; mediaType: string; filename: string }>,
  ) {
    let contentWithFiles = content;
    if (files && files.length > 0) {
      const fileUrls = files.map(f => f.url).join(", ");
      contentWithFiles = `${content}\n\nAttached files: ${fileUrls}`;
    }

    this.messages.push({
      id: crypto.randomUUID(),
      role,
      parts: [{ type: "text" as const, text: contentWithFiles }],
    });
  }

  private async getSystemPrompt() {
    let systemPrompt = this.state.systemPrompt;

    if (!systemPrompt) {
      systemPrompt = getSystemPrompt(this.state.tier);
      this.setState({ ...this.state, systemPrompt });
    }

    // Add learnings about this user
    const learnings = this.state.learnings || [];
    if (learnings.length > 0) {
      const learningsBlock = learnings.map((l) => `• ${l}`).join("\n");
      systemPrompt = `${systemPrompt}\n\n<learnings>
Things I learned from the user:
${learningsBlock}

Use these to personalize my responses. Follow any instructions they've given me.
</learnings>`;
    }

    // Add shared history
    const history = this.state.sharedHistory || [];
    if (history.length > 0) {
      const historyBlock = history.map((h, i) => `${i + 1}. ${h}`).join("\n");
      systemPrompt = `${systemPrompt}\n\n<ourStory>
Our shared history:
${historyBlock}

Reference these naturally when relevant. This is our evolving relationship.
</ourStory>`;
    }

    if (this.state.userSection) {
      systemPrompt = `${systemPrompt}\n\n<userContext>\n${this.state.userSection}\n</userContext>`;
    }

    return systemPrompt;
  }

  private async prepareModelMessages(multiModalTools: ToolSet) {
    const flattenedMessages = this.messages.map((msg) => this.flattenMessage(msg));

    if (this.messages.length <= 50) {
      return convertToModelMessages(flattenedMessages, {
        tools: multiModalTools,
      });
    }

    return this.compressMessages(flattenedMessages, multiModalTools);
    
  }

  private async compressMessages(flattenedMessages: UIMessage[], multiModalTools: ToolSet) {
    this.setState({ ...this.state, compressing: true });

    const keepCount = 15;
    const summarizeCount = flattenedMessages.length - keepCount;
    const messagesToSummarize = flattenedMessages.slice(0, summarizeCount);
    const remainingMessages = flattenedMessages.slice(summarizeCount);

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
    this.sql`delete from cf_ai_chat_agent_messages`;

    // Persist flattened messages (text-only) after summarization
    await this.persistMessages([summaryMessage, ...this.messages.slice(summarizeCount)]);

    this.setState({ ...this.state, compressing: false });

    return convertToModelMessages([summaryMessage, ...remainingMessages], {
      tools: multiModalTools,
    });
  }

  // --- Public Methods ---

  // Convert file attachment to markdown using Workers AI binding
  async convertFileToMarkdown(file: { url: string; mediaType: string; filename: string }): Promise<string> {
    try {
      let blob: Blob;

      if (file.url.startsWith("data:")) {
        const [, base64Data] = file.url.split(",");
        if (!base64Data) {
          return "Invalid file data format";
        }

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const mimeTypeMatch = file.url.match(/data:([^;]+)/);
        const mimeType = mimeTypeMatch?.[1] || "application/octet-stream";
        blob = new Blob([bytes], { type: mimeType });
      } else {
        const response = await fetch(file.url);
        if (!response.ok) {
          return `Failed to fetch file: ${response.statusText}`;
        }
        blob = await response.blob();
      }

      const results = await this.env.AI.toMarkdown([
        {
          name: file.filename,
          blob: blob,
        },
      ]);

      if (Array.isArray(results) && results.length > 0) {
        const result = results[0];
        if (result.format === "markdown") {
          const markdown = `\n\n## ${file.filename}\n\n${result.data}`;
          return markdown;
        }
        return `\n\n## ${file.filename}\n\nConversion error: ${result.error || "Unknown error"}`;
      }
      return "";
    } catch (e) {
      return `\n\n## ${file.filename}\n\nError: ${e}`;
    }
  }

  // Generate image using Cloudflare Workers AI Flux model
  // Returns base64 image string directly for use with toModelOutput
  async generateImage(prompt: string): Promise<string> {
    const response = await this.env.AI.run(
      "@cf/black-forest-labs/flux-1-schnell" as Parameters<typeof this.env.AI.run>[0],
      { prompt }
    );

    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const imageData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        imageData.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to binary string safely
      let binary = '';
      const len = imageData.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(imageData[i]);
      }
      return btoa(binary);
    } else if (typeof response === "object" && "image" in response) {
      return (response as { image: string }).image;
    }
    
    throw new Error("Unexpected response format from AI model");
  }

  async chat(prompt: string, files?: Array<{ url: string; mediaType: string; filename: string }>, _tier?: Tier): Promise<string> {
    if (_tier) this.setTier(_tier);

    await this.addMessage("user", prompt, files);

    let responseText = "";
    await this.onChatMessage(async (event) => {
      if (event.text) {
        responseText = event.text;
        await this.addMessage("assistant", event.text);
        await this.persistMessages(this.messages);
      }
    });

    return responseText;
  }

  async streamChat(prompt: string, files?: Array<{ url: string; mediaType: string; filename: string }>): Promise<Response> {
    await this.addMessage("user", prompt, files);

    return this.onChatMessage(async (event) => {
      if (event.text) {
        await this.addMessage("assistant", event.text);
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

    const allTools = await this.getAllTools();

    // Streaming: use the existing createStreamResponse with AI SDK streaming
    const { textStream } = streamText({
      model: this.model,
      system: await this.getSystemPrompt(),
      messages: await this.prepareModelMessages({
        "generateImage": generateImageTool((prompt) => this.generateImage(prompt))
      }),
      tools: {
        ...allTools,
        generateImage: generateImageTool((prompt) => this.generateImage(prompt))
      },
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
    const url = new URL(ctx.request.url);
    const queryToken = url.searchParams.get("token");
    const tier = (
      ["genin", "chunin", "jonin"].includes(h.get("X-Atlas-Tier") || "")
        ? h.get("X-Atlas-Tier")
        : "genin"
    ) as Tier;

    const atlasAccessToken =
      h.get("X-Atlas-Access-Token") || queryToken || undefined;
    const providerApiKey =
      h.get("X-Provider-API-Key") || this.env.HEYATLAS_PROVIDER_API_KEY || "";
    const apiUrl =
      h.get("X-Provider-API-URL") || this.env.HEYATLAS_PROVIDER_API_URL || "";

    if (providerApiKey && apiUrl) {
      this.setState({
        ...this.state,
        credentials: {
          userId: h.get("X-User-ID") || this.name || "",
          email: h.get("X-User-Email") || undefined,
          providerApiKey,
          providerApiUrl: apiUrl,
          atlasAccessToken,
        },
        tier,
      });
    } else {
      this.setState({ ...this.state, tier });
    }

    const activeAgentId = h.get("X-Agent-Id");
    const interactiveMode = h.get("X-Interactive-Mode") === "true";
    if (activeAgentId) {
      this.setState({
        ...this.state,
        activeAgent: activeAgentId,
        interactiveMode,
        interactiveTaskId: interactiveMode
          ? this.state.interactiveTaskId
          : null,
      });
    } else if (this.state.interactiveMode) {
      this.setState({
        ...this.state,
        interactiveMode: false,
        interactiveTaskId: null,
      });
    }

    const cfg = getTierConfig(tier);
    if (cfg.hasCloudDesktop) this.ensureSandbox().catch(() => {});

    await this.buildMCPServers();

    conn.send(JSON.stringify({ type: "connected", userId: this.userId }));
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
    atlasAccessToken: string;
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
          atlasAccessToken: auth.atlasAccessToken,
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
      this.ensureSandbox().catch(() => {});
    }

    // Ensure MCP servers are initialized for HTTP requests (voice mode)
    await this.buildMCPServers();

    return this.chatCompletions(messages, stream, tier);
  }

  /**
   * Handle direct chat endpoint (called from Hono router)
   */
  async handleChat(prompt: string, files?: Array<{ url: string; mediaType: string; filename: string }>, tier?: Tier): Promise<string> {
    if (tier && ["genin", "chunin", "jonin"].includes(tier)) {
      this.setTier(tier);
    }

    const cfg = getTierConfig(this.state.tier);

    return this.chat(prompt, files);
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
  broadcast_task_event(
    taskId: string,
    event: { type: string; timestamp: number; data: Record<string, unknown> },
  ): void {
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

  /**
   * Expose a port from the Cloudflare sandbox and return a shareable URL
   */
  @callable({ description: "Expose a port from the Cloudflare sandbox" })
  async exposeSandboxPort(port: number, hostname?: string): Promise<{ url: string } | null> {
    if (this.state.sandbox?.type !== "cloudflare") {
      return null;
    }
    return exposeSandboxPort(
      this.env.Sandbox,
      this.state.sandbox.sandboxId,
      port,
      hostname || "heyatlas.app",
    );
  }

  /**
   * Toggle mini-computer (e2b desktop with smith)
   */
  async toggleMiniComputer(enabled: boolean): Promise<{ success: boolean; vncUrl?: string; error?: string }> {
    if (enabled) {
      try {
        await this.ensureSandbox();
        
        const vncUrl = this.state.sandbox?.vncUrl;
        
        this.setState({
          ...this.state,
          miniComputer: {
            active: true,
            sandboxId: this.state.sandbox?.sandboxId,
            vncUrl,
          },
        });

        return { success: true, vncUrl };
      } catch (error) {
        console.error("[Atlas] Error starting mini-computer:", error);
        return { success: false, error: "Failed to start mini-computer" };
      }
    } else {
      this.setState({
        ...this.state,
        miniComputer: { active: false },
      });

      return { success: true };
    }
  }
}
