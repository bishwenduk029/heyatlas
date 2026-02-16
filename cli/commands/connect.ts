/**
 * Connect command - Connect local agent to Atlas
 *
 * Unified handler for all ACP agent types.
 */

import { login } from "../auth";
import { AtlasTunnel, type Task } from "../tunnel";
import { ACPProviderAgent, isACPAgent, getACPCommand } from "../agents/acp-provider";
import { type AgentType } from "../agents/config";

interface ConnectOptions {
  openBrowser?: boolean;
  /** Agent type: local (user's machine) or sandbox (e2b/cloud) */
  agentType?: "local" | "sandbox";
  /** Path to task JSON file for single-task mode */
  taskFile?: string;
}

/** Common interface for all agents */
interface Agent {
  name: string;
  isAvailable(): Promise<boolean>;
  init(): Promise<void>;
  stream(prompt: string, taskId?: string): AsyncIterable<StreamChunk>;
  cleanup(): void;
}

interface StreamChunk {
  type: string;
  id?: string;
  delta?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  subAgentName?: string;
  [key: string]: unknown;
}

interface UIMessagePart {
  type: string;
  [key: string]: unknown;
}

export async function connect(agentType: AgentType, options: ConnectOptions = {}) {
  const credentials = await login();
  
  // Create the appropriate agent wrapper
  const agent = createAgent(agentType);
  if (!agent) {
    console.error(`Error: Unknown agent type '${agentType}'`);
    process.exit(1);
  }

  // Check availability
  if (!(await agent.isAvailable())) {
    const cmd = getACPCommand(agentType);
    console.error(`Error: Agent '${agentType}' is not installed or not in PATH`);
    console.error(`Command: ${cmd.join(" ")}`);
    process.exit(1);
  }

  console.log(`Agent: ${agent.name}`);

  // Initialize
  try {
    await agent.init();
    console.log("Agent initialized");
  } catch (error) {
    console.error(`Failed to initialize agent: ${error}`);
    process.exit(1);
  }

  // Connect tunnel
  const tunnel = new AtlasTunnel({
    host: process.env.ATLAS_AGENT_HOST || "agent.heyatlas.app",
    token: credentials.accessToken,
    interactive: true,
    agentType: options.agentType || "local",
  });

  // Task mode: run a single task from file and exit
  if (options.taskFile) {
    const fs = await import("fs");
    const taskData = JSON.parse(fs.readFileSync(options.taskFile, "utf-8")) as Task;
    console.log(`Task: ${taskData.description.slice(0, 80)}...`);

    await tunnel.connect(credentials.userId, agent.name);
    await tunnel.waitForState();
    console.log("Tunnel established");

    try {
      await handleTask(taskData, agent, tunnel);
      console.log("\nTask complete. Disconnecting...");
    } catch (error) {
      console.error(`Task failed: ${error}`);
    } finally {
      agent.cleanup();
      await tunnel.disconnect();
      process.exit(0);
    }
    return;
  }

  // Agent mode: listen for tasks
  tunnel.onNewTask(async (task: Task) => {
    await handleTask(task, agent, tunnel);
  });

  await tunnel.connect(credentials.userId, agent.name);
  console.log("Tunnel established");

  // Open browser
  const voiceUrl = `${process.env.HEYATLAS_API || "https://heyatlas.app"}/chat`;
  if (options.openBrowser !== false) {
    openBrowser(voiceUrl);
  }

  console.log(`\nHeyAtlas connected to ${agent.name}`);
  console.log(`Continue here: ${voiceUrl}`);
  console.log("\nPress Ctrl+C to disconnect\n");

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log("\nDisconnecting...\n");
    agent.cleanup();
    await tunnel.disconnect();
    process.exit(0);
  });

  await new Promise(() => {});
}

/** Create agent wrapper based on type */
function createAgent(agentType: AgentType): Agent | null {
  if (!isACPAgent(agentType)) return null;

  const acp = new ACPProviderAgent(agentType, { cwd: process.cwd() });
  
  return {
    name: agentType,
    isAvailable: () => acp.isAvailable(),
    init: () => acp.init(),
    async *stream(prompt: string, _taskId?: string) {
      const result = acp.stream(prompt);
      for await (const chunk of result.toUIMessageStream()) {
        yield chunk as StreamChunk;
      }
    },
    cleanup: () => acp.cleanup(),
  };
}

/** Handle a task from the tunnel */
async function handleTask(task: Task, agent: Agent, tunnel: AtlasTunnel) {
  const { prompt, latestUserMessage } = buildPromptWithContext(task);
  const isNewTask = task.state === "new";
  console.log(`${isNewTask ? "New" : "Continue"}: ${latestUserMessage.slice(0, 50)}...`);

  await tunnel.updateTask(task.id, { state: "in-progress" });
  await tunnel.appendContext(task.id, [
    { type: "message", timestamp: Date.now(), data: { role: "user", content: latestUserMessage } },
  ]);

  try {
    const parts = await processStream(task.id, agent.stream(prompt, task.id), tunnel);

    if (parts.length > 0) {
      await tunnel.appendContext(task.id, [
        { type: "ui_message", timestamp: Date.now(), data: { id: crypto.randomUUID(), role: "assistant", parts } },
      ]);
    }

    const outputs = readOutputsManifest();
    await tunnel.updateTask(task.id, {
      state: "completed",
      result: "end_turn",
      ...(outputs.length > 0 ? { outputs } : {}),
    });
    if (outputs.length > 0) console.log(`Uploaded ${outputs.length} file(s)`);
    console.log("Task completed");
  } catch (error) {
    console.error(`Task failed: ${error}`);
    await tunnel.updateTask(task.id, { state: "failed", result: String(error) });
  }
}

/** Process stream chunks and build UI message parts */
async function processStream(
  taskId: string,
  stream: AsyncIterable<StreamChunk>,
  tunnel: AtlasTunnel
): Promise<UIMessagePart[]> {
  const parts: UIMessagePart[] = [];
  const toolCalls = new Map<string, UIMessagePart>();
  const reasoningParts = new Map<string, UIMessagePart>();

  for await (const chunk of stream) {
    // Broadcast to UI
    await tunnel.broadcastTaskEvent(taskId, {
      type: "ui_stream_chunk",
      timestamp: Date.now(),
      data: chunk as Record<string, unknown>,
    });

    // Build final message parts
    switch (chunk.type) {
      case "text-delta": {
        const deltaText = chunk.delta || chunk.text || "";
        const existing = parts.find((p) => p.type === "text");
        if (existing && "text" in existing) {
          existing.text += deltaText;
        } else {
          parts.push({ type: "text", text: deltaText });
        }
        break;
      }

      case "reasoning-start": {
        const part = { type: "reasoning", text: "", state: "streaming" };
        reasoningParts.set(chunk.id || "default", part);
        parts.push(part);
        break;
      }

      case "reasoning-delta":
      case "reasoning": {
        const id = chunk.id || "default";
        let part = reasoningParts.get(id);
        if (!part) {
          part = { type: "reasoning", text: "", state: "streaming" };
          reasoningParts.set(id, part);
          parts.push(part);
        }
        part.text += chunk.delta || chunk.text || "";
        break;
      }

      case "reasoning-end": {
        const part = reasoningParts.get(chunk.id || "default");
        if (part) {
          part.state = "done";
          reasoningParts.delete(chunk.id || "default");
        }
        break;
      }

      case "tool-input-available":
      case "tool-call": {
        const input = chunk.input as Record<string, unknown> | undefined;
        const toolName = (input?.toolName as string) || chunk.toolName || "tool";
        const args = (input?.args as Record<string, unknown>) || input || {};
        const toolCallId = chunk.toolCallId || "";

        const part = {
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: "input-available",
          input: args,
          subAgentName: chunk.subAgentName,
        };
        toolCalls.set(toolCallId, part);
        parts.push(part);
        break;
      }

      case "tool-output-available":
      case "tool-result": {
        const toolCallId = chunk.toolCallId || "";
        const existing = toolCalls.get(toolCallId);
        if (existing) {
          existing.state = "output-available";
          existing.output = chunk.output;
        }
        break;
      }
    }
  }

  return parts;
}

/** Build prompt with conversation context */
function buildPromptWithContext(task: Task): { prompt: string; latestUserMessage: string } {
  const context = task.context || [];
  const messages: { role: string; content: string }[] = [];

  for (const event of context) {
    const e = event as unknown as Record<string, unknown>;
    
    if (e.type === "ui_message" && e.data) {
      const data = e.data as Record<string, unknown>;
      const parts = data.parts as Array<Record<string, unknown>> | undefined;
      const textPart = parts?.find((p) => p.type === "text");
      if (textPart?.text) {
        messages.push({ role: String(data.role || "assistant"), content: String(textPart.text) });
      }
    } else if (e.type === "message" && e.data) {
      const data = e.data as Record<string, unknown>;
      if (data.role && data.content) {
        messages.push({ role: String(data.role), content: String(data.content) });
      }
    } else if (e.role && e.content) {
      messages.push({ role: String(e.role), content: String(e.content) });
    }
  }

  const userMessages = messages.filter((m) => m.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1]?.content || task.description || "Hello";

  if (task.state === "new" || messages.length === 0) {
    return { prompt: task.description || latestUserMessage, latestUserMessage };
  }

  let prompt = task.description ? `Original task: ${task.description}\n\n` : "";
  
  if (messages.length > 0) {
    prompt += "Conversation history:\n";
    for (const msg of messages) {
      prompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`;
    }
    prompt += "\nPlease continue based on the above context.";
  }

  return { prompt, latestUserMessage };
}

/** Read outputs.json written by the opencode upload plugin */
function readOutputsManifest(): { url: string; filename: string; type?: string }[] {
  try {
    const fs = require("fs");
    const path = require("path");
    const manifestPath = path.join(process.cwd(), "agents", "outputs.json");
    if (!fs.existsSync(manifestPath)) return [];
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    fs.unlinkSync(manifestPath);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Open URL in browser */
function openBrowser(url: string) {
  try {
    const { execSync } = require("child_process");
    const cmd = process.platform === "darwin" ? "open" 
              : process.platform === "win32" ? 'start ""' 
              : "xdg-open";
    execSync(`${cmd} "${url}"`, { stdio: "ignore" });
  } catch {}
}
