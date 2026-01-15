/**
 * Connect command - Connect local agent to Atlas
 *
 * Supports two types of agents:
 * 1. ACP agents - Use @mcpc-tech/acp-ai-provider for streaming
 * 2. HTTP agents - Use HTTP API for task execution (agent-smith-py)
 */

import { login } from "../auth";
import { AtlasTunnel, type Task } from "../tunnel";
import {
  ACPProviderAgent,
  isACPAgent,
  getACPCommand,
  type ACPAgentType,
} from "../agents/acp-provider";
import { isHTTPAgent, type AgentType, type HTTPAgentType } from "../agents/config";
import { HTTPAgent } from "../agents/http-agent";

interface ConnectOptions {
  openBrowser?: boolean;
}

interface UIMessagePart {
  type: string;
  [key: string]: unknown;
}

export async function connect(
  agentType: AgentType,
  options: ConnectOptions = {},
) {
  const credentials = await login();

  // Route to appropriate handler
  if (isHTTPAgent(agentType)) {
    return connectHTTPAgent(agentType, credentials, options);
  }
  
  if (isACPAgent(agentType)) {
    return connectACPAgent(agentType, credentials, options);
  }

  console.error(`Error: Unknown agent type '${agentType}'`);
  process.exit(1);
}

/**
 * Connect HTTP-based agent (agent-smith-py)
 */
async function connectHTTPAgent(
  agentType: HTTPAgentType,
  credentials: { userId: string; accessToken: string },
  options: ConnectOptions,
) {
  const agent = new HTTPAgent(agentType, { cwd: process.cwd() });

  // Check availability
  const available = await agent.isAvailable();
  if (!available) {
    console.error(`Error: Python not found. Install Python 3.11+ to use ${agentType}`);
    process.exit(1);
  }

  console.log(`Agent: ${agentType} (HTTP mode)`);

  // Start the agent server
  try {
    console.log("Starting agent server...");
    await agent.start();
    console.log(`Agent server running on port ${agent.port}`);
  } catch (error) {
    console.error(`Failed to start agent: ${error}`);
    process.exit(1);
  }

  // Create Atlas tunnel
  const tunnel = new AtlasTunnel({
    host: process.env.ATLAS_AGENT_HOST || "agent.heyatlas.app",
    token: credentials.accessToken,
    interactive: true,
  });

  // Handle tasks from Atlas
  tunnel.onNewTask(async (task: Task) => {
    const prompt = task.description || "Hello";
    console.log(`Task: ${prompt.slice(0, 50)}...`);

    await tunnel.updateTask(task.id, { state: "in-progress" });
    await tunnel.appendContext(task.id, [
      {
        type: "message",
        timestamp: Date.now(),
        data: { role: "user", content: prompt },
      },
    ]);

    // Broadcast that agent-smith-py is processing
    await tunnel.broadcastTaskEvent(task.id, {
      type: "workforce_event",
      timestamp: Date.now(),
      data: { event_type: "task_started", task_content: prompt },
    });

    try {
      // Use streaming to get real-time workforce events
      let finalResult = "Task completed";
      let finalStatus = "completed";
      const parts: UIMessagePart[] = [];

      for await (const event of agent.executeTaskStream(prompt, task.id)) {
        // Broadcast workforce event to UI
        await tunnel.broadcastTaskEvent(task.id, {
          type: "workforce_event",
          timestamp: Date.now(),
          data: event,
        });

        // Track final result
        if (event.event_type === "result") {
          finalResult = event.result || event.error || "Task completed";
          finalStatus = event.status || "completed";
        }

        // Log progress
        if (event.event_type === "task_assigned") {
          console.log(`  → Assigned to: ${event.worker_name?.slice(0, 40)}...`);
        } else if (event.event_type === "task_decomposed") {
          console.log(`  → Decomposed into ${event.subtasks?.length || 0} subtasks`);
        }
      }

      // Store final result
      await tunnel.appendContext(task.id, [
        {
          type: "ui_message",
          timestamp: Date.now(),
          data: {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [{ type: "text", text: finalResult }],
          },
        },
      ]);

      await tunnel.updateTask(task.id, {
        state: finalStatus === "completed" ? "completed" : "failed",
        result: finalResult,
      });
      console.log(`Task ${finalStatus}`);
    } catch (error) {
      console.error(`Task failed: ${error}`);
      await tunnel.updateTask(task.id, {
        state: "failed",
        result: String(error),
      });
    }
  });

  // Connect to Atlas
  await tunnel.connect(credentials.userId, agentType);
  console.log("Tunnel established");

  // Open browser
  const voiceUrl = `${process.env.HEYATLAS_API || "https://heyatlas.app"}/chat`;
  if (options.openBrowser !== false) {
    try {
      const { execSync } = await import("child_process");
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? 'start ""'
            : "xdg-open";
      execSync(`${cmd} "${voiceUrl}"`, { stdio: "ignore" });
    } catch {}
  }

  console.log(`\nHeyAtlas connected to ${agentType}`);
  console.log(`Continue here: ${voiceUrl}`);
  console.log("\nPress Ctrl+C to disconnect\n");

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log("\nDisconnecting...\n");
    agent.stop();
    await tunnel.disconnect();
    process.exit(0);
  });

  await new Promise(() => {});
}

/**
 * Connect ACP-based agent (opencode, goose, etc.)
 */
async function connectACPAgent(
  agentType: ACPAgentType,
  credentials: { userId: string; accessToken: string },
  options: ConnectOptions,
) {
  const agent = new ACPProviderAgent(agentType, { cwd: process.cwd() });

  const available = await agent.isAvailable();
  if (!available) {
    const cmd = getACPCommand(agentType);
    console.error(`Error: Agent '${agentType}' is not installed or not in PATH`);
    console.error(`Command: ${cmd.join(" ")}`);
    process.exit(1);
  }

  console.log(`Agent: ${agentType} (via ACP AI Provider)`);

  try {
    await agent.init();
    console.log("ACP provider initialized");
  } catch (error) {
    console.error(`Failed to initialize agent: ${error}`);
    process.exit(1);
  }

  const tunnel = new AtlasTunnel({
    host: process.env.ATLAS_AGENT_HOST || "agent.heyatlas.app",
    token: credentials.accessToken,
    interactive: true,
  });

  tunnel.onNewTask(async (task: Task) => {
    const { prompt, latestUserMessage } = buildPromptWithContext(task);
    const isNewTask = task.state === "new";
    console.log(`${isNewTask ? "New" : "Continue"}: ${latestUserMessage.slice(0, 50)}...`);

    await tunnel.updateTask(task.id, { state: "in-progress" });
    await tunnel.appendContext(task.id, [
      {
        type: "message",
        timestamp: Date.now(),
        data: { role: "user", content: latestUserMessage },
      },
    ]);

    try {
      const result = agent.stream(prompt);
      const parts: UIMessagePart[] = [];
      const toolCalls = new Map<string, UIMessagePart>();
      const activeReasoningParts = new Map<string, UIMessagePart>();

      for await (const chunk of result.toUIMessageStream()) {
        await tunnel.broadcastTaskEvent(task.id, {
          type: "ui_stream_chunk",
          timestamp: Date.now(),
          data: chunk as Record<string, unknown>,
        });

        switch (chunk.type) {
          case "text-delta": {
            const existingText = parts.find((p) => p.type === "text");
            if (existingText && "text" in existingText) {
              existingText.text += chunk.delta || "";
            } else {
              parts.push({ type: "text", text: chunk.delta || "" });
            }
            break;
          }

          case "reasoning-start": {
            const reasoningPart = {
              type: "reasoning" as const,
              text: "",
              state: "streaming" as const,
            };
            activeReasoningParts.set(chunk.id || "default", reasoningPart);
            parts.push(reasoningPart);
            break;
          }

          case "reasoning-delta":
          case "reasoning": {
            const id = chunk.id || "default";
            let reasoningPart = activeReasoningParts.get(id);
            if (!reasoningPart) {
              reasoningPart = { type: "reasoning", text: "", state: "streaming" };
              activeReasoningParts.set(id, reasoningPart);
              parts.push(reasoningPart);
            }
            reasoningPart.text += chunk.delta || (chunk as any).text || "";
            break;
          }

          case "reasoning-end": {
            const id = chunk.id || "default";
            const reasoningPart = activeReasoningParts.get(id);
            if (reasoningPart) {
              reasoningPart.state = "done";
              activeReasoningParts.delete(id);
            }
            break;
          }

          case "tool-input-available": {
            const input = chunk.input as Record<string, unknown> | undefined;
            const realToolName = (input?.toolName as string) || chunk.toolName;
            const realArgs = (input?.args as Record<string, unknown>) || input || {};
            
            toolCalls.set(chunk.toolCallId, {
              type: "dynamic-tool",
              toolCallId: chunk.toolCallId,
              toolName: realToolName,
              state: "input-available",
              input: realArgs,
            });
            parts.push(toolCalls.get(chunk.toolCallId)!);
            break;
          }

          case "tool-output-available": {
            const existing = toolCalls.get(chunk.toolCallId);
            if (existing) {
              const updated = { ...existing, state: "output-available", output: chunk.output };
              toolCalls.set(chunk.toolCallId, updated);
              const idx = parts.findIndex(
                (p) => p.type === "dynamic-tool" && p.toolCallId === chunk.toolCallId
              );
              if (idx >= 0) parts[idx] = updated;
            }
            break;
          }
        }
      }

      if (parts.length > 0) {
        await tunnel.appendContext(task.id, [
          {
            type: "ui_message",
            timestamp: Date.now(),
            data: { id: crypto.randomUUID(), role: "assistant", parts },
          },
        ]);
      }

      await tunnel.updateTask(task.id, { state: "completed", result: "end_turn" });
      console.log("Task completed");
    } catch (error) {
      console.error(`Task failed: ${error}`);
      await tunnel.updateTask(task.id, { state: "failed", result: String(error) });
    }
  });

  await tunnel.connect(credentials.userId, agentType);
  console.log("Tunnel established");

  const voiceUrl = `${process.env.HEYATLAS_API || "https://heyatlas.app"}/chat`;
  if (options.openBrowser !== false) {
    try {
      const { execSync } = await import("child_process");
      const cmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? 'start ""'
            : "xdg-open";
      execSync(`${cmd} "${voiceUrl}"`, { stdio: "ignore" });
    } catch {}
  }

  console.log(`\nHeyAtlas connected to ${agentType}`);
  console.log(`Continue here: ${voiceUrl}`);
  console.log("\nPress Ctrl+C to disconnect\n");

  process.on("SIGINT", async () => {
    console.log("\nDisconnecting...\n");
    agent.cleanup();
    await tunnel.disconnect();
    process.exit(0);
  });

  await new Promise(() => {});
}

/**
 * Build prompt with context for ACP agent
 */
function buildPromptWithContext(task: Task): {
  prompt: string;
  latestUserMessage: string;
} {
  const context = task.context || [];
  const messages: { role: string; content: string }[] = [];

  for (const event of context) {
    const e = event as unknown as Record<string, unknown>;
    if (e.type === "ui_message" && e.data) {
      const data = e.data as Record<string, unknown>;
      const parts = data.parts as Array<Record<string, unknown>> | undefined;
      if (parts) {
        const textPart = parts.find((p) => p.type === "text");
        if (textPart && textPart.text) {
          messages.push({
            role: String(data.role || "assistant"),
            content: String(textPart.text),
          });
        }
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
  const latestUserMessage =
    userMessages[userMessages.length - 1]?.content || task.description || "Hello";

  if (task.state === "new" || messages.length === 0) {
    return { prompt: task.description || latestUserMessage, latestUserMessage };
  }

  let prompt = "";
  if (task.description) {
    prompt += `Original task: ${task.description}\n\n`;
  }

  if (messages.length > 0) {
    prompt += "Conversation history:\n";
    for (const msg of messages) {
      const prefix = msg.role === "user" ? "User" : "Assistant";
      prompt += `${prefix}: ${msg.content}\n`;
    }
    prompt += "\nPlease continue based on the above context.";
  }

  return { prompt, latestUserMessage };
}
