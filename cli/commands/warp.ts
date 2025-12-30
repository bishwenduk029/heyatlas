/**
 * Warp command - Connect local agent to Atlas via ACP
 *
 * Uses the Agent Client Protocol (ACP) for unified communication
 * with all compatible agents (opencode, claude, goose, gemini, etc.)
 */

import { login } from "../auth";
import { AtlasTunnel, type Task } from "../tunnel";
import {
  ACPAgent,
  isACPAgent,
  getACPCommand,
  type ACPAgentType,
} from "../agents/acp";
import type { StreamEvent } from "../agents/types";
import type { AgentType } from "../agents/config";

interface WarpOptions {
  openBrowser?: boolean;
}

export async function warp(agentType: AgentType, options: WarpOptions = {}) {
  console.log("\n✨ Warming up the warp drive...\n");

  const credentials = await login();

  // Check if agent supports ACP
  if (!isACPAgent(agentType)) {
    console.error(`❌ Agent '${agentType}' is not ACP-compatible`);
    console.error(
      `   Supported agents: opencode, claude, goose, gemini, codex, etc.`,
    );
    process.exit(1);
  }

  // Create ACP agent
  const agent = new ACPAgent(agentType as ACPAgentType);

  // Check availability
  const available = await agent.isAvailable();
  if (!available) {
    const cmd = getACPCommand(agentType as ACPAgentType);
    console.error(`💀 Agent '${agentType}' is not installed or not in PATH`);
    console.error(`   Command: ${cmd.join(" ")}`);
    process.exit(1);
  }

  console.log(`🤖 Agent: ${agentType} (via ACP)`);

  // Create Atlas tunnel
  const tunnel = new AtlasTunnel({
    host:
      process.env.ATLAS_AGENT_HOST ||
      (process.env.NODE_ENV === "development"
        ? "localhost:8787"
        : "agent.heyatlas.app"),
    token: credentials.accessToken,
    interactive: true, // ACP is always interactive
  });

  // Track current task for event routing
  let currentTaskId: string | null = null;
  let messageBuffer = ""; // Buffer for streaming message chunks

  // Event handler - broadcasts all events for real-time UI
  // Storage happens only when prompt completes (see onNewTask handler)
  const handleEvent = async (event: StreamEvent) => {
    if (!currentTaskId || !tunnel.isConnected) return;

    // Handle message events - buffer for final storage
    if (event.type === "message") {
      const content = String(event.data.content || "");
      if (event.data.delta) {
        // Streaming chunk - accumulate
        messageBuffer += content;
      } else {
        // Complete message from ACP (after flushMessage) - use directly
        messageBuffer = content;
      }
    }

    // Broadcast ALL events for real-time UI display (ephemeral)
    const eventWithTimestamp: StreamEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    };
    tunnel
      .broadcastTaskEvent(currentTaskId, eventWithTimestamp)
      .catch(() => {});
  };

  // Start ACP agent (session created per-task)
  try {
    await agent.start({
      cwd: process.cwd(),
      onEvent: handleEvent,
      onError: (error) => {
        console.error(`❌ Agent error: ${error.message}`);
      },
    });
    console.log(`✅ ACP agent started`);
  } catch (error) {
    console.error(`❌ Failed to start agent: ${error}`);
    process.exit(1);
  }

  // Handle tasks from Atlas
  tunnel.onNewTask(async (task: Task) => {
    currentTaskId = task.id;
    messageBuffer = "";

    // Build prompt with context for ACP agent
    const { prompt, latestUserMessage } = buildPromptWithContext(task);
    const isNewTask = task.state === "new";
    console.log(
      `📥 ${isNewTask ? "New" : "Continue"}: ${latestUserMessage.slice(0, 50)}...`,
    );

    // Create new session for this task
    const sessionId = await agent.createSession();

    // Update task state and store latest user message
    await tunnel.updateTask(task.id, { state: "in-progress" });
    await tunnel.appendContext(task.id, [
      {
        type: "message",
        timestamp: Date.now(),
        data: { role: "user", content: latestUserMessage },
      },
    ]);

    try {
      // Send prompt to ACP agent
      const stopReason = await agent.prompt(prompt);

      // Store final assistant message (persistent)
      const finalContent = messageBuffer.trim();
      if (finalContent.length > 0) {
        await tunnel.appendContext(task.id, [
          {
            type: "message",
            timestamp: Date.now(),
            data: { role: "assistant", content: finalContent },
          },
        ]);
      }
      messageBuffer = "";

      // Mark task complete
      await tunnel.updateTask(task.id, {
        state: "completed",
        result: stopReason,
      });
      console.log(`✅ Task completed`);
    } catch (error) {
      console.error(`❌ Task failed: ${error}`);
      await tunnel.updateTask(task.id, {
        state: "failed",
        result: String(error),
      });
    } finally {
      currentTaskId = null;
    }
  });

  // Connect to Atlas
  await tunnel.connect(credentials.userId, agentType);
  console.log(`🔗 Tunnel established`);

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

  console.log(`\n🎙️  Voice Companion connected to ${agentType}`);
  console.log(`🌐 Talk here: ${voiceUrl}`);
  console.log(`\n🛑 Press Ctrl+C to disconnect\n`);

  // Cleanup on exit
  process.on("SIGINT", async () => {
    console.log("\n👋 Warping out...\n");
    await agent.stop();
    await tunnel.disconnect();
    process.exit(0);
  });

  await new Promise(() => {});
}

/**
 * Build prompt with context for ACP agent
 * Returns full prompt (with context) and the latest user message (for storage)
 */
function buildPromptWithContext(task: Task): {
  prompt: string;
  latestUserMessage: string;
} {
  const context = task.context || [];

  // Extract messages from context
  const messages: { role: string; content: string }[] = [];
  for (const event of context) {
    const e = event as any;
    if (e.type === "message" && e.data?.role && e.data?.content) {
      messages.push({ role: e.data.role, content: e.data.content });
    } else if (e.role && e.content) {
      messages.push({ role: e.role, content: e.content });
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
