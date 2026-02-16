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
  type Tool,
  UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Sandbox } from "@e2b/code-interpreter";
import type { Env, AgentState, Task, SelectedAgent, SandboxMetadata, ChatMessage, FileAttachment } from "./types";
import type { Tier } from "./prompts";
import { getSystemPrompt, getSystemPromptTemplate, getTierConfig, SPEECH_GENERATION_PROMPT, PROMPT_VERSION } from "./prompts";
import { buildTools, generateImageTool } from "./lib/tools";
import { createStreamResponse } from "./lib/completions";
import { createFSTools, type CloudflareStorage } from "./lib/agentfs";
import { createWebSearchTool } from "./lib/web-search";
import {
  createCodingSandbox,
  connectAgentInSandbox,
  destroySandbox,
  connectToSandbox,
  getSandboxPublicUrl,
  type Sandbox as CodingSandbox,
} from "./lib/coding-sandbox";

const SMITH_CONFIG = {
  template: "heyatlas-desktop",
  port: 3141,
  startupCommand: "npx -y heyatlas connect smith --no-browser > ~/agents/smith.log 2>&1",
};

export class AtlasAgent extends AIChatAgent<Env, AgentState> {
  initialState: AgentState = {
    credentials: null,
    tier: "genin",
    tokensUsed: 0,
    persona: null,
    personaUpdatedAt: null,
    sandbox: null,
    tasks: {},
    agents: [],
    activeAgent: null, // deprecated, kept for backward compat
    interactiveMode: false,
    interactiveTaskId: null,
    systemPrompt: null,
    promptVersion: 0,
    userSection: null,
    compressing: false,
    lastInputTokens: 0,
    userDetails: [],
    userPreferences: [],
  };
  private codingAgentSandbox: CodingSandbox | null = null;
  private _webSearchTool: ReturnType<typeof createWebSearchTool> | null = null;

  /**
   * Get web search tool, lazily initialized with API key
   */
  private get webSearchTool() {
    if (!this._webSearchTool && this.env.PARALLEL_API_KEY) {
      this._webSearchTool = createWebSearchTool(this.env.PARALLEL_API_KEY);
    }
    return this._webSearchTool;
  }

  /**
   * Clean legacy fields from state before setting.
   * The DO may have persisted old fields that are no longer in the schema.
   */
  private cleanState(state: AgentState): AgentState {
    const clean = { ...state };
    // Remove legacy fields that may be persisted in DO state
    const legacyFields = ["selectedAgent", "cloudflareSandbox", "connectedAgentId", "miniComputer"];
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

  private mcpAdding = false;

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

  private get chatModel() {
    return this.llm.chat(this.env.LLM_CHAT_MODEL || this.env.LLM_MODEL || "gpt-4o-mini");
  }

  private get tools() {
    return buildTools({
      userId: this.userId,
      tier: this.state.tier,
      broadcast: (msg: string) => this.broadcast(msg),
      sandbox: this.state.sandbox,
      handOffToAgent: (task, assignedAgent, existingTaskId) =>
        this.handOffToAgent(task, assignedAgent, existingTaskId),
      getConnectedAgents: () => this.getConnectedAgents(),
      getTask: (taskId) => this.getTask(taskId),
      listTasks: () => this.listTasks(),
      deleteTask: (taskId) => this.deleteTask(taskId),
      updateUserContext: (userSection: string) =>
        this.updateUserSection(userSection),
      convertFileToMarkdown: (file) => this.convertFileToMarkdown(file),
      // Memory
      remember: (type: "user_detail" | "user_preference", content: string) => this.remember(type, content),
      // Sandbox URL
      getSandboxPortUrl: (port: number) => this.getSandboxPortUrl(port),
      compressMemory: () => this.triggerCompression(),
    });
  }

  private async getAllTools() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (this as any).ctx?.storage as CloudflareStorage | undefined;
    const fsTools = storage ? await createFSTools(storage) : {};

    return { ...this.tools, ...fsTools };
  }

  // --- Task Management ---

  /**
   * Hand off task to a specific connected agent
   */
  async handOffToAgent(task: string, assignedAgent: string, existingTaskId?: string): Promise<string> {
    const agents = this.state.agents || [];
    const agent = agents.find(a => a.id === assignedAgent);

    // For smith: create a sandbox and start smith inside it
    if (assignedAgent === "smith") {
      if (!this.env.E2B_API_KEY || !this.state.credentials) {
        return "E2B API key or credentials not configured. Cannot create sandbox for Smith.";
      }

      // Create or update the task first
      let taskObj: Task;
      if (existingTaskId) {
        this.updateTask(existingTaskId, task);
        taskObj = this.state.tasks[existingTaskId];
        if (!taskObj) return `Task not found: ${existingTaskId}`;
      } else {
        taskObj = this.createTaskForAgent(task, assignedAgent);
      }

      // Create a sandbox for this task
      try {
        const envs = {
          HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
          HEYATLAS_PROVIDER_API_URL: this.state.credentials.providerApiUrl,
          HEYATLAS_ACCESS_TOKEN: this.state.credentials.atlasAccessToken || "",
          HEYATLAS_USER_ID: this.userId,
          ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "agent.heyatlas.app",
          // Working directory for camel-ai MCP toolkits (docx, pptx, excel)
          WORKING_DIRECTORY: "/home/user/output",
          // Ensure opencode/uv/bun are in PATH for non-interactive shells
          PATH: "/home/user/.opencode/bin:/home/user/.local/bin:/usr/local/bin:/usr/bin:/bin",
        };

        const sandbox = await Sandbox.create(SMITH_CONFIG.template, {
          apiKey: this.env.E2B_API_KEY,
          envs,
          timeoutMs: 3600 * 1000,
        });

        // Write credentials
        const credentialsJson = JSON.stringify({
          accessToken: this.state.credentials.atlasAccessToken,
          userId: this.userId,
          email: this.state.credentials.email || "sandbox@heyatlas.app",
        }, null, 2);
        await sandbox.commands.run("mkdir -p /home/user/.heyatlas");
        await sandbox.files.write("/home/user/.heyatlas/credentials.json", credentialsJson);

        // Write rclone config for R2 uploads
        if (this.env.R2_ACCESS_KEY_ID && this.env.R2_SECRET_ACCESS_KEY && this.env.R2_ACCOUNT_ID) {
          const r2Endpoint = `https://${this.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
          const rcloneConfig = `[r2]
type = s3
provider = Cloudflare
access_key_id = ${this.env.R2_ACCESS_KEY_ID}
secret_access_key = ${this.env.R2_SECRET_ACCESS_KEY}
endpoint = ${r2Endpoint}
acl = private
no_check_bucket = true
`;
          await sandbox.commands.run("mkdir -p /home/user/.config/rclone");
          await sandbox.files.write("/home/user/.config/rclone/rclone.conf", rcloneConfig);
        }

        // Write task metadata (bucket, userId, taskId) for rclone upload path
        const taskMeta = {
          bucket: this.env.R2_BUCKET_NAME || "heyatlas-uploads",
          userId: this.userId,
          taskId: taskObj.id,
          publicUrl: this.env.R2_PUBLIC_URL || "",
        };
        await sandbox.files.write("/home/user/agents/task-meta.json", JSON.stringify(taskMeta));

        // Write task file for smith to pick up directly
        await sandbox.files.write("/home/user/agents/task.json", JSON.stringify(taskObj));

        // Start smith in task mode — runs the task and exits
        const taskCmd = `npx -y heyatlas connect smith --no-browser --task-file /home/user/agents/task.json > ~/agents/smith.log 2>&1`;
        await sandbox.commands.run(taskCmd, {
          background: true,
          envs,
        });

        // Store sandbox ID on the task
        const tasks = { ...this.state.tasks };
        tasks[taskObj.id] = { ...tasks[taskObj.id], sandboxId: sandbox.sandboxId };
        this.setState({ ...this.state, tasks });

        console.log(`[Atlas] Created sandbox ${sandbox.sandboxId} for task ${taskObj.id}`);
        return `Created task ${taskObj.id} for smith. Sandbox starting — Smith will connect shortly.`;
      } catch (e) {
        console.error("[Atlas] Failed to create sandbox for task:", e);
        return `Failed to create sandbox for smith: ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    }

    // For other agents: must be connected
    if (!agent) {
      const available = agents.map(a => a.id).join(", ") || "none";
      return `Agent '${assignedAgent}' is not connected. Available: ${available}. Run 'npx heyatlas connect ${assignedAgent}' to connect.`;
    }

    if (existingTaskId) {
      this.updateTask(existingTaskId, task);
      return `Updated task ${existingTaskId} for ${assignedAgent}.`;
    }

    const newTask = this.createTaskForAgent(task, assignedAgent);
    return `Created task ${newTask.id} for ${assignedAgent} (${agent.type}).`;
  }

  /**
   * Get list of connected agents
   */
  getConnectedAgents(): Array<{ id: string; type: "local" | "sandbox" }> {
    return (this.state.agents || []).map(a => ({ id: a.id, type: a.type }));
  }

  /**
   * Create task assigned to a specific agent
   */
  createTaskForAgent(description: string, assignedAgent: string): Task {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      assignedAgent,
      description,
      state: "new",
      context: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.setState({
      ...this.state,
      tasks: { ...this.state.tasks, [id]: task },
    });
    return task;
  }

  async createTaskWithSandbox(
    description: string,
    selectedAgent: SelectedAgent,
  ): Promise<Task> {
    const currentTasks = this.state.tasks || {};

    // If remote agent selected, create E2B sandbox first
    if (selectedAgent.type === "cloud" && this.state.credentials && this.env.E2B_API_KEY) {
      const agentId = selectedAgent.agentId;
      try {
        const { sandboxId, sandbox } = await createCodingSandbox(
          this.env.E2B_API_KEY,
          agentId,
          { timeoutMs: 3600 * 1000 },
        );
        this.codingAgentSandbox = sandbox;

        // Build environment variables for the agent
        const envVars: Record<string, string> = {
          HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
          HEYATLAS_PROVIDER_API_URL: this.state.credentials.providerApiUrl,
          ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "localhost:8787",
        };

        envVars.GOOSE_PROVIDER = "litellm";
        envVars.GOOSE_MODEL = this.env.LLM_MODEL || "gpt-4o-mini";

        const connected = await connectAgentInSandbox(
          sandbox,
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

        // Store E2B sandbox state at agent level
        this.setState(this.cleanState({
          ...this.state,
          sandbox: {
            type: "e2b",
            sandboxId,
            agentConnected: connected,
          },
          activeAgent: connected ? agentId : null,
        }));
      } catch (e) {
        console.error("[Atlas] Failed to create E2B sandbox:", e);
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

  // --- Memory ---

  remember(type: "user_detail" | "user_preference", content: string): void {
    if (type === "user_detail") {
      const details = [...(this.state.userDetails || [])];
      if (!details.some(d => d.toLowerCase() === content.toLowerCase())) {
        details.push(content);
        this.setState({ ...this.state, userDetails: details });
      }
    } else {
      const prefs = [...(this.state.userPreferences || [])];
      if (!prefs.some(p => p.toLowerCase() === content.toLowerCase())) {
        prefs.push(content);
        this.setState({ ...this.state, userPreferences: prefs });
      }
    }
  }

  /**
   * Trigger compression manually (called by compressMemory tool).
   * Runs the same cleanup as automatic compression but can be invoked at any time.
   */
  private async triggerCompression(): Promise<string> {
    if (this.messages.length < 5) {
      return "Not enough messages to compress.";
    }

    const allTools = await this.getAllTools();
    await this.compressMessages(this.messages, allTools);
    return `Memory compressed. ${this.messages.length} messages retained. State reset — fresh prompt will load on next turn.`;
  }

  @callable({ description: "Select or connect a coding agent (local or cloud)" })
  async selectAgent(
    agent: SelectedAgent,
    apiKey?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Destroy previous cloud sandbox if switching agents
    if (this.state.sandbox && this.codingAgentSandbox) {
      const prevAgentId = this.state.activeAgent;
      const newAgentId = agent.type === "cloud" ? agent.agentId : "local";

      if (prevAgentId && prevAgentId !== newAgentId) {
        await destroySandbox(this.codingAgentSandbox);
        this.codingAgentSandbox = null;
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
      if (!this.env.E2B_API_KEY) {
        return { success: false, error: "E2B API key not configured" };
      }

      try {
        const agentId = agent.agentId;

        // Create coding agent sandbox
        const { sandboxId, sandbox } = await createCodingSandbox(
          this.env.E2B_API_KEY,
          agentId,
          { timeoutMs: 3600 * 1000 },
        );
        this.codingAgentSandbox = sandbox;

        // Build environment variables
        const envVars: Record<string, string> = {
          HEYATLAS_PROVIDER_API_KEY: this.state.credentials.providerApiKey,
          HEYATLAS_PROVIDER_API_URL: this.state.credentials.providerApiUrl,
          ATLAS_AGENT_HOST: this.env.ATLAS_AGENT_HOST || "localhost:8787",
        };

        // Agent-specific configuration
        if (agentId === "goose" || agentId === "opencode") {
          envVars.GOOSE_PROVIDER = "litellm";
          envVars.GOOSE_MODEL = "Baseten/zai-org/GLM-4.7";
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

        // Connect agent in sandbox
        const connected = await connectAgentInSandbox(
          sandbox,
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
            type: "e2b",
            sandboxId,
            agentConnected: connected,
          },
          activeAgent: agentId,
        }));

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
    if (this.codingAgentSandbox) {
      await destroySandbox(this.codingAgentSandbox);
      this.codingAgentSandbox = null;
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
    console.log(`[Atlas] onChatMessage started, messages count: ${this.messages.length}`);
    const systemPrompt = await this.getSystemPrompt();
    console.log(`[Atlas] System prompt ready, length: ${systemPrompt.length}`);
    const allTools = await this.getAllTools();

    const generateImage = generateImageTool((prompt) => this.generateImage(prompt));
    const tools = {
      ...(this.webSearchTool ? { 'web-search': this.webSearchTool } : {}),
      ...allTools,
      generateImage,
    };
    console.log(`[Atlas] Tools ready: ${Object.keys(tools).join(', ')}`);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          console.log(`[Atlas] Preparing model messages...`);
          const modelMessages = await this.prepareModelMessages(tools);
          console.log(`[Atlas] Model messages ready, count: ${modelMessages.length}`);

          console.log(`[Atlas] Starting streamText...`);
          const result = streamText({
            model: this.chatModel,
            system: systemPrompt,
            messages: modelMessages,
            tools,
            toolChoice: "auto",
            onFinish: async (event) => {
              console.log(`[Atlas] streamText onFinish, finishReason: ${event.finishReason}, usage: ${JSON.stringify(event.usage)}`);
              const inputTokens = event.usage?.inputTokens ?? 0;
              if (inputTokens > 0) {
                this.setState({ ...this.state, lastInputTokens: inputTokens });
                console.log(`[Atlas] Input tokens this turn: ${inputTokens}`);
              }
              await onFinish(event as unknown as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]);
            },
            stopWhen: stepCountIs(10),
          });

          writer.merge(result.toUIMessageStream());
          console.log(`[Atlas] Stream merged into writer`);
        } catch (err) {
          console.error(`[Atlas] Error in stream execute:`, err);
          throw err;
        }
      },
    });

    console.log(`[Atlas] Returning stream response`);
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

  /**
   * Get current date string for system prompt
   */
  private getCurrentDate(): string {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  /**
   * Build system prompt with dynamic date and memory sections.
   * Base prompt is regenerated when PROMPT_VERSION changes.
   */
  private async getSystemPrompt() {
    const stateVersion = this.state.promptVersion || 0;
    let basePrompt = this.state.systemPrompt;
    if (!basePrompt || stateVersion < PROMPT_VERSION) {
      console.log(`[Atlas] Refreshing system prompt: v${stateVersion} → v${PROMPT_VERSION}`);
      basePrompt = getSystemPromptTemplate(this.state.tier);
      this.setState({ ...this.state, systemPrompt: basePrompt, promptVersion: PROMPT_VERSION });
    }

    const currentDate = this.getCurrentDate();
    let systemPrompt = basePrompt.replace(
      /<currentDate>.*?<\/currentDate>/,
      `<currentDate>${currentDate}</currentDate>`
    );

    const details = (this.state.userDetails || []).slice(-15);
    if (details.length > 0) {
      systemPrompt += `\n\n<userDetails>\n${details.map(d => `• ${d}`).join("\n")}\n</userDetails>`;
    }

    const prefs = (this.state.userPreferences || []).slice(-10);
    if (prefs.length > 0) {
      systemPrompt += `\n\n<userPreferences>\n${prefs.map(p => `• ${p}`).join("\n")}\n</userPreferences>`;
    }

    if (this.state.userSection) {
      let section = this.state.userSection;
      section = section.replace(/<systemPrompt>[\s\S]*?<\/systemPrompt>/g, "");
      section = section.replace(/<toolExecution>[\s\S]*?<\/toolExecution>/g, "");
      section = section.substring(0, 2000);
      if (section.trim()) {
        systemPrompt += `\n\n<userContext>\n${section.trim()}\n</userContext>`;
      }
    }

    return systemPrompt;
  }

  // Context window limit and compaction threshold
  private static readonly CONTEXT_WINDOW_LIMIT = 200_000;
  private static readonly COMPACTION_THRESHOLD = 0.50; // Trigger at 50% of context window

  private shouldCompact(): boolean {
    const lastTokens = this.state.lastInputTokens || 0;
    const threshold = AtlasAgent.CONTEXT_WINDOW_LIMIT * AtlasAgent.COMPACTION_THRESHOLD;
    if (lastTokens >= threshold) {
      console.log(`[Atlas] Token-based compaction triggered: ${lastTokens} tokens >= ${threshold} threshold (${Math.round(lastTokens / AtlasAgent.CONTEXT_WINDOW_LIMIT * 100)}% of ${AtlasAgent.CONTEXT_WINDOW_LIMIT})`);
      return true;
    }
    return false;
  }

  private async prepareModelMessages(multiModalTools: ToolSet) {
    if (!this.shouldCompact()) {
      return convertToModelMessages(this.messages, {
        tools: multiModalTools,
      });
    }

    return this.compressMessages(this.messages, multiModalTools);
  }

  private async compressMessages(messages: UIMessage[], multiModalTools: ToolSet) {
    this.setState({ ...this.state, compressing: true });

    const keepCount = 15;
    const summarizeCount = messages.length - keepCount;
    const messagesToSummarize = messages.slice(0, summarizeCount);
    const remainingMessages = messages.slice(summarizeCount);

    const conversationText = messagesToSummarize
      .map((m) => `[${m.role.toUpperCase()}]: ${m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}`)
      .join("\n\n");

    const summaryPrompt = `You are Atlas, an AI companion. Do TWO things:

1. Summarize the conversation from your perspective (first person), starting with "I had a conversation where...". Focus on topics discussed, decisions made, and outcomes. Do NOT describe tool calls, tool failures, or internal system behavior.

2. Extract NEW user details and preferences not already known.
   - user_details: Only real facts about the user (name, family, job, interests, location, projects)
   - user_preferences: Only genuine communication/behavior preferences (e.g., "prefers concise answers", "likes Tailwind")
   - EXCLUDE: anything about tool call formats, system prompt rules, or internal agent behavior

<conversation>
${conversationText}
</conversation>

<existing_user_details>
${(this.state.userDetails || []).map(d => `• ${d}`).join("\n") || "None"}
</existing_user_details>

<existing_user_preferences>
${(this.state.userPreferences || []).map(p => `• ${p}`).join("\n") || "None"}
</existing_user_preferences>

Return VALID JSON only:
{
  "summary": "I had a conversation where...",
  "user_details": ["NEW facts about user: name, relationships, job, family, etc."],
  "user_preferences": ["NEW genuine behavior/style preferences from user"]
}

Empty arrays if nothing new to extract.`;

    let summaryText = "Memory compacted.";
    let newDetails: string[] = [];
    let newPrefs: string[] = [];

    try {
      const { text } = await generateText({
        model: this.model,
        messages: [{ role: "user", content: summaryPrompt }],
        toolChoice: "none",
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summaryText = parsed.summary || summaryText;
        newDetails = Array.isArray(parsed.user_details) ? parsed.user_details : [];
        newPrefs = Array.isArray(parsed.user_preferences) ? parsed.user_preferences : [];
      } else {
        summaryText = text;
      }
    } catch (e) {
      console.error("[Atlas] Failed to compress messages:", e);
    }

    // --- State cleanup during compression ---
    const currentDetails = this.state.userDetails || [];
    const currentPrefs = this.state.userPreferences || [];

    // Merge new, then cap to prevent unbounded growth
    const mergedDetails = [
      ...currentDetails,
      ...newDetails.filter(d =>
        !currentDetails.some(e => e.toLowerCase().includes(d.toLowerCase()))
      ),
    ].slice(-15);

    // Filter out meta/tool-format preferences that hurt tool calling
    const metaPatterns = /tool.?call|function|invoke|system prompt|format|markdown|xml|backtick/i;
    const mergedPrefs = [
      ...currentPrefs,
      ...newPrefs.filter(p =>
        !currentPrefs.some(e => e.toLowerCase().includes(p.toLowerCase()))
      ),
    ].filter(p => !metaPatterns.test(p)).slice(-10);

    this.setState({
      ...this.state,
      userDetails: mergedDetails,
      userPreferences: mergedPrefs,
      lastInputTokens: 0,
      userSection: null,
      systemPrompt: null,
      promptVersion: 0,
    });

    const summaryMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: summaryText }],
    };

    this.sql`delete from cf_ai_chat_agent_messages`;
    await this.persistMessages([summaryMessage, ...this.messages.slice(summarizeCount)]);

    console.log(`[Atlas] Compression complete: ${mergedDetails.length} details, ${mergedPrefs.length} prefs, state reset`);
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
      model: this.chatModel,
      system: (await this.getSystemPrompt()) + SPEECH_GENERATION_PROMPT,
      messages: await this.prepareModelMessages({
        "generateImage": generateImageTool((prompt) => this.generateImage(prompt))
      }),
      tools: {
        ...allTools,
        ...(this.webSearchTool ? { 'web-search': this.webSearchTool } : {}),
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

    // Extract token for auth validation
    const authHeader = h.get("Authorization");
    const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = tokenFromHeader || queryToken;

    // Try to fetch fresh credentials from /api/me if we have a token
    if (token) {
      try {
        const apiBase = this.env.AUTH_API_BASE || "https://www.heyatlas.app";
        const res = await fetch(`${apiBase}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const user = await res.json() as {
            id: string;
            email?: string;
            tier?: string;
            virtualKey?: { apiKey: string; apiUrl: string };
          };

          const userTier = (
            ["genin", "chunin", "jonin"].includes(user.tier || "")
              ? user.tier
              : tier
          ) as Tier;

          if (user.virtualKey?.apiKey && user.virtualKey?.apiUrl) {
            console.log("[Atlas] onConnect: refreshed credentials for user:", user.id);
            this.setState({
              ...this.state,
              credentials: {
                userId: user.id,
                email: user.email || undefined,
                providerApiKey: user.virtualKey.apiKey,
                providerApiUrl: user.virtualKey.apiUrl,
                atlasAccessToken: token,
              },
              tier: userTier,
            });
          } else {
            console.log("[Atlas] onConnect: user has no virtualKey, using env fallback");
            this.setState({ ...this.state, tier: userTier });
          }
        } else {
          console.log("[Atlas] onConnect: token validation failed:", res.status);
        }
      } catch (e) {
        console.log("[Atlas] onConnect: error validating token:", e);
      }
    }

    // Fallback to header-based credentials (for CLI agents passing explicit headers)
    if (!this.state.credentials?.providerApiKey) {
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
            atlasAccessToken: token || undefined,
          },
          tier,
        });
      } else {
        this.setState({ ...this.state, tier });
      }
    }

    // Agent info comes as query params from AgentClient (headers not supported)
    const activeAgentId = url.searchParams.get("X-Agent-Id") || h.get("X-Agent-Id");
    const agentType = (url.searchParams.get("X-Agent-Type") || h.get("X-Agent-Type") || "local") as "local" | "sandbox";
    const interactiveMode = (url.searchParams.get("X-Interactive-Mode") || h.get("X-Interactive-Mode")) === "true";

    if (activeAgentId) {
      // Store agentId on connection for onClose cleanup
      (conn as unknown as { agentId?: string }).agentId = activeAgentId;

      // Add agent to agents array (or update if exists)
      const existingAgents = this.state.agents || [];
      const otherAgents = existingAgents.filter(a => a.id !== activeAgentId);
      const newAgent = {
        id: activeAgentId,
        type: agentType,
        connectedAt: Date.now(),
      };

      this.setState({
        ...this.state,
        agents: [...otherAgents, newAgent],
        activeAgent: activeAgentId, // deprecated, kept for backward compat
        interactiveMode,
        interactiveTaskId: interactiveMode
          ? this.state.interactiveTaskId
          : null,
      });

      console.log(`[Atlas] Agent connected: ${activeAgentId} (${agentType})`);
    } else if (this.state.interactiveMode) {
      this.setState({
        ...this.state,
        interactiveMode: false,
        interactiveTaskId: null,
      });
    }

    conn.send(JSON.stringify({ type: "connected", userId: this.userId }));
  }

  /**
   * Handle agent disconnection - remove from agents array
   * Note: We track connected agents by storing agentId on the connection
   */
  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    // Get agentId from connection state (set during onConnect)
    const agentId = (conn as unknown as { agentId?: string }).agentId;

    if (agentId) {
      const existingAgents = this.state.agents || [];
      const remainingAgents = existingAgents.filter(a => a.id !== agentId);

      // Update activeAgent for backward compat
      const newActiveAgent = remainingAgents.length > 0
        ? remainingAgents[remainingAgents.length - 1].id
        : null;

      this.setState({
        ...this.state,
        agents: remainingAgents,
        activeAgent: newActiveAgent,
      });

      console.log(`[Atlas] Agent disconnected: ${agentId}`);
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
   * Get public URL for a port exposed from the coding agent sandbox
   * Use this when the agent runs a server (e.g., dev server on port 3000)
   */
  @callable({ description: "Get public URL for a port in the coding agent sandbox" })
  async getSandboxPortUrl(port: number): Promise<{ url: string; sandboxId: string } | null> {
    if (!this.codingAgentSandbox || !this.state.sandbox) {
      return null;
    }
    const url = getSandboxPublicUrl(this.codingAgentSandbox, port);
    return { url, sandboxId: this.state.sandbox.sandboxId };
  }

}
