/**
 * Warp command - Connect local agent to Atlas
 */

import { login, loadCredentials } from "../auth";
import { AtlasTunnel } from "../tunnel";
import { createAgent, type AgentType, buildTaskWithPrompt } from "../agents";

interface WarpOptions {
  openBrowser?: boolean;
}

export async function warp(agent: AgentType, options: WarpOptions = {}) {
  console.log("\n✨ Warming up the warp drive...\n");

  // 1. Check/perform authentication
  let credentials = loadCredentials();
  if (!credentials) {
    credentials = await login();
  }

  // 2. Verify agent is available
  const agentInstance = createAgent(agent);
  const available = await agentInstance.isAvailable();
  if (!available) {
    console.error(`💀 Oops! '${agent}' is not installed or not in PATH`);
    process.exit(1);
  }

  console.log(`🤖 Agent locked: ${agent}`);

  // 3. Connect to Atlas agent via WebSocket
  const atlasHost = process.env.ATLAS_AGENT_HOST || "localhost:8787";
  const tunnel = new AtlasTunnel({
    host: atlasHost,
    token: credentials.accessToken,
    reconnect: true,
  });

  // Set up message handler for tasks from Atlas
  tunnel.sub(async (content, data) => {
    // Handle task messages from Atlas
    if (data?.type !== "task" && data?.type !== "tasks") return;

    console.log(`📥 Task received: ${content.substring(0, 80)}...`);

    try {
      const fullTask = buildTaskWithPrompt(content, agent);
      const result = await (agentInstance as any).run(fullTask, {});
      const output = result.stdout || "Task completed";

      // Send response back to Atlas
      await tunnel.publish({
        type: "task-response",
        content: output,
        status: "completed",
        agent,
        source: "cli",
      });

      console.log(`✅ Task completed`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Task failed: ${errorMsg}`);

      await tunnel.publish({
        type: "task-response",
        content: errorMsg,
        status: "error",
        agent,
        source: "cli",
      });
    }
  });

  await tunnel.connectToRoom(credentials.userId, {
    agentId: agent,
    role: "cli-agent",
  });

  console.log(`🔗 Tunnel established`);

  // 4. Open browser
  const baseUrl = process.env.HEYATLAS_API || "https://www.heyatlas.app";
  const voiceUrl = `${baseUrl}/voice`;

  if (options.openBrowser !== false) {
    try {
      const { execSync } = await import("child_process");
      if (process.platform === "darwin") {
        execSync(`open "${voiceUrl}"`, { stdio: "ignore" });
      } else if (process.platform === "win32") {
        execSync(`start "" "${voiceUrl}"`, { stdio: "ignore" });
      } else {
        execSync(`xdg-open "${voiceUrl}"`, { stdio: "ignore" });
      }
    } catch {
      // Browser open failed silently
    }
  }

  // 5. Ready message
  console.log(`\n🎙️  Your AI Voice Companion connected to ${agent}`);
  console.log(`🌐 Talk here: ${voiceUrl}`);
  console.log(`\n🛑 Press Ctrl+C to disconnect\n`);

  process.on("SIGINT", async () => {
    console.log("\n👋 Warping out... See you next time!\n");
    await tunnel.disconnect();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
