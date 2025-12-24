/**
 * Warp command - Connect local agent to Atlas
 * 
 * Single responsibility: Connect to Atlas and route tasks to agents.
 * Task state management is handled by agents (base.ts, droid.ts).
 */

import { login } from "../auth";
import { AtlasTunnel, type Task } from "../tunnel";
import { createAgent, type AgentType } from "../agents";
import { ptyManager } from "../agents/pty-manager";
import type { InteractiveSession } from "../agents/types";

interface WarpOptions {
  openBrowser?: boolean;
  interactive?: boolean;
}

export async function warp(agentType: AgentType, options: WarpOptions = {}) {
  console.log("\n✨ Warming up the warp drive...\n");

  const credentials = await login();

  const agentInstance = createAgent(agentType);
  if (!(await agentInstance.isAvailable())) {
    console.error(`💀 Oops! '${agentType}' is not installed or not in PATH`);
    process.exit(1);
  }

  if (options.interactive && !agentInstance.interactive) {
    console.error(`❌ Interactive mode not supported for ${agentType} agent`);
    process.exit(1);
  }

  console.log(`🤖 Agent locked: ${agentType}${options.interactive ? " (interactive)" : ""}`);

  const tunnel = new AtlasTunnel({
    host: process.env.ATLAS_AGENT_HOST || "localhost:8787",
    token: credentials.accessToken,
    interactive: options.interactive,
  });

  // Interactive session handle
  let session: InteractiveSession | null = null;

  if (options.interactive && agentInstance.runInteractive) {
    try {
      session = await agentInstance.runInteractive(tunnel);
    } catch (error) {
      console.error(`❌ Failed to start interactive session: ${error}`);
      process.exit(1);
    }
  }

  // Route tasks to agent - state management handled by agent
  tunnel.onNewTask(async (task: Task) => {

    // Non-interactive: run agent with full task context
    try {
      await agentInstance.run(task, { 
        tunnel,
        taskContext: task.context,
      });
      console.log(`✅ Task completed`);
    } catch (error) {
      console.error(`❌ Task failed: ${error instanceof Error ? error.message : error}`);
    }
  });

  await tunnel.connect(credentials.userId, agentType);
  console.log(`🔗 Tunnel established`);

  // Open browser
  const voiceUrl = `${process.env.HEYATLAS_API || "https://www.heyatlas.app"}/voice`;
  if (options.openBrowser !== false) {
    try {
      const { execSync } = await import("child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
      execSync(`${cmd} "${voiceUrl}"`, { stdio: "ignore" });
    } catch {}
  }

  console.log(`\n🎙️  Your AI Voice Companion connected to ${agentType}`);
  console.log(`🌐 Talk here: ${voiceUrl}`);
  console.log(`\n🛑 Press Ctrl+C to disconnect\n`);

  process.on("SIGINT", async () => {
    console.log("\n👋 Warping out... See you next time!\n");
    session?.kill();
    ptyManager.killAll();
    await tunnel.disconnect();
    process.exit(0);
  });

  await new Promise(() => {});
}

/** Extract first task message for display (full context passed separately) */
function extractTaskContent(task: Task): string | null {
  if (task.context?.length) {
    const first = task.context[0] as any;
    return first?.content || first?.data?.text || first?.data?.content || null;
  }
  return task.result || null;
}
