/**
 * Connect command - Connect local agent to Atlas via ACP AI Provider
 *
 * Simplified implementation using @mcpc-tech/acp-ai-provider.
 * Streams UIMessage format via toUIMessageStream() for native AI SDK UI rendering.
 */

import { login } from "../auth";
import { AtlasTunnel, type Task } from "../tunnel";
import {
  ACPProviderAgent,
  isACPAgent,
  getACPCommand,
  type ACPAgentType,
} from "../agents/acp-provider";
import type { AgentType } from "../agents/config";

interface ConnectOptions {
  openBrowser?: boolean;
}

// UIMessage part types for task context storage
interface UIMessagePart {
  type: string;
  [key: string]: unknown;
}

export async function connect(agentType: AgentType, options: ConnectOptions = {}) {
  const credentials = await login();

  if (!isACPAgent(agentType)) {
    console.error(`Error: Agent '${agentType}' is not ACP-compatible`);
    console.error(`Supported agents: opencode, claude, goose, gemini, codex, etc.`);
    process.exit(1);
  }

  // Create ACP provider agent
  const agent = new ACPProviderAgent(agentType as ACPAgentType, {
    cwd: process.cwd(),
  });

  // Check availability
  const available = await agent.isAvailable();
  if (!available) {
    const cmd = getACPCommand(agentType as ACPAgentType);
    console.error(`Error: Agent '${agentType}' is not installed or not in PATH`);
    console.error(`Command: ${cmd.join(" ")}`);
    process.exit(1);
  }

  console.log(`Agent: ${agentType} (via ACP AI Provider)`);

  // Initialize ACP provider
  try {
    await agent.init();
    console.log(`ACP provider initialized`);
  } catch (error) {
    console.error(`Failed to initialize agent: ${error}`);
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
    const { prompt, latestUserMessage } = buildPromptWithContext(task);
    const isNewTask = task.state === "new";
    console.log(`${isNewTask ? "New" : "Continue"}: ${latestUserMessage.slice(0, 50)}...`);

    // Update task state
    await tunnel.updateTask(task.id, { state: "in-progress" });
    await tunnel.appendContext(task.id, [
      {
        type: "message",
        timestamp: Date.now(),
        data: { role: "user", content: latestUserMessage },
      },
    ]);

    try {
      // Stream prompt to ACP agent
      const result = agent.stream(prompt);
      const parts: UIMessagePart[] = [];
      const toolCalls = new Map<string, UIMessagePart>();
      const activeReasoningParts = new Map<string, UIMessagePart>();

      // Iterate toUIMessageStream once for BOTH real-time UI and building parts
      for await (const chunk of result.toUIMessageStream()) {
        // Broadcast for real-time UI
        await tunnel.broadcastTaskEvent(task.id, {
          type: "ui_stream_chunk",
          timestamp: Date.now(),
          data: chunk as Record<string, unknown>,
        });

        // Build parts in stream order (text, reasoning, tools interspersed)
        switch (chunk.type) {
          case "text-delta": {
            const existingText = parts.find(p => p.type === "text");
            if (existingText && "text" in existingText) {
              existingText.text += chunk.delta || "";
            } else {
              parts.push({ type: "text", text: chunk.delta || "" });
            }
            break;
          }

          case "reasoning-start": {
            // Start a new reasoning part (thinking/planning content)
            const reasoningPart = {
              type: "reasoning" as const,
              text: "",
              state: "streaming" as const,
            };
            activeReasoningParts.set(chunk.id, reasoningPart);
            parts.push(reasoningPart);
            break;
          }

          case "reasoning-delta": {
            // Append to existing reasoning part
            const reasoningPart = activeReasoningParts.get(chunk.id);
            if (reasoningPart && "text" in reasoningPart) {
              reasoningPart.text += chunk.delta || "";
            }
            break;
          }

          case "reasoning-end": {
            // Mark reasoning as done
            const reasoningPart = activeReasoningParts.get(chunk.id);
            if (reasoningPart) {
              reasoningPart.state = "done";
              activeReasoningParts.delete(chunk.id);
            }
            break;
          }

          case "tool-input-available":
            toolCalls.set(chunk.toolCallId, {
              type: "dynamic-tool",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              state: "input-available" as const,
              input: chunk.input,
            });
            parts.push(toolCalls.get(chunk.toolCallId)!);
            break;

          case "tool-output-available":
            const existing = toolCalls.get(chunk.toolCallId);
            if (existing) {
              const updated = {
                ...existing,
                state: "output-available" as const,
                output: chunk.output,
              };
              toolCalls.set(chunk.toolCallId, updated);
              const idx = parts.findIndex(p => p.type === "dynamic-tool" && p.toolCallId === chunk.toolCallId);
              if (idx >= 0) parts[idx] = updated;
            }
            break;
        }
      }

      // Store as UIMessage in task context
      if (parts.length > 0) {
        await tunnel.appendContext(task.id, [
          {
            type: "ui_message",
            timestamp: Date.now(),
            data: {
              id: crypto.randomUUID(),
              role: "assistant",
              parts,
            },
          },
        ]);
      }

      // Mark task complete
      await tunnel.updateTask(task.id, {
        state: "completed",
        result: "end_turn",
      });
      console.log(`Task completed`);
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
  console.log(`Tunnel established`);

  // Open browser
  const voiceUrl = `${process.env.HEYATLAS_API || "https://www.heyatlas.app"}/chat`;
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
  console.log(`Talk here: ${voiceUrl}`);
  console.log(`\nPress Ctrl+C to disconnect\n`);

  // Cleanup on exit
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

  // Extract messages from context (supports both old message format and new ui_message format)
  const messages: { role: string; content: string }[] = [];
  for (const event of context) {
    const e = event as unknown as Record<string, unknown>;
    if (e.type === "ui_message" && e.data) {
      // New UIMessage format - extract text from parts
      const data = e.data as Record<string, unknown>;
      const parts = data.parts as Array<Record<string, unknown>> | undefined;
      if (parts) {
        const textPart = parts.find(p => p.type === "text");
        if (textPart && textPart.text) {
          messages.push({ role: String(data.role || "assistant"), content: String(textPart.text) });
        }
      }
    } else if (e.type === "message" && e.data) {
      // Legacy message format
      const data = e.data as Record<string, unknown>;
      if (data.role && data.content) {
        messages.push({ role: String(data.role), content: String(data.content) });
      }
    } else if (e.role && e.content) {
      messages.push({ role: String(e.role), content: String(e.content) });
    }
  }

  // Get latest user message
  const userMessages = messages.filter((m) => m.role === "user");
  const latestUserMessage =
    userMessages[userMessages.length - 1]?.content ||
    task.description ||
    "Hello";

  // For new tasks, just use the description
  if (task.state === "new" || messages.length === 0) {
    return { prompt: task.description || latestUserMessage, latestUserMessage };
  }

  // For continued tasks, build prompt with conversation history
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
