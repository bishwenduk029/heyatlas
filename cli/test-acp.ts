#!/usr/bin/env bun
/**
 * Standalone ACP Agent Test
 * 
 * Tests the ACP agent implementation without any Atlas/WebSocket connection.
 * Run with: bun run test-acp.ts [agent] [message]
 * 
 * Examples:
 *   bun run test-acp.ts opencode "list files in current directory"
 *   bun run test-acp.ts claude "what is 2+2"
 */

import { ACPAgent, isACPAgent, getACPCommand, type ACPAgentType } from "./agents/acp";
import type { StreamEvent } from "./agents/types";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(color: keyof typeof colors, prefix: string, message: string) {
  console.log(`${colors[color]}${prefix}${colors.reset} ${message}`);
}

// Event statistics
const stats = {
  total: 0,
  byType: {} as Record<string, number>,
};

function handleEvent(event: StreamEvent) {
  stats.total++;
  stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

  switch (event.type) {
    case "message":
      if (event.data.role === "assistant") {
        process.stdout.write(colors.green + event.data.content + colors.reset);
      } else {
        log("blue", "[USER]", event.data.content);
      }
      break;

    case "tool_call":
      log("yellow", `[TOOL ${event.data.status}]`, `${event.data.name} (${event.data.id?.slice(0, 8)})`);
      break;

    case "tool_update":
      log("yellow", `[TOOL UPDATE]`, `${event.data.id?.slice(0, 8)} → ${event.data.status}`);
      break;

    case "plan":
      log("magenta", "[PLAN]", JSON.stringify(event.data.entries?.slice(0, 3)));
      break;

    case "thinking":
      log("cyan", "[THINKING]", String(event.data.content).slice(0, 100));
      break;

    case "status":
      log("blue", "[STATUS]", event.data.message || event.data.status);
      break;

    case "permission":
      log("red", "[PERMISSION]", `${event.data.title} - auto-approving`);
      break;

    default:
      log("dim", `[${event.type}]`, JSON.stringify(event.data).slice(0, 100));
  }
}

async function listAvailableAgents() {
  const agents: ACPAgentType[] = [
    "opencode", "claude", "goose", "gemini", "codex", 
    "kimi", "vibe", "auggie", "stakpak", "openhands", "cagent"
  ];

  console.log("\n📋 Available ACP Agents:\n");
  
  for (const agentName of agents) {
    const agent = new ACPAgent(agentName);
    const available = await agent.isAvailable();
    const command = getACPCommand(agentName);
    const status = available ? "✅" : "❌";
    console.log(`  ${status} ${agentName.padEnd(12)} → ${command.join(" ")}`);
  }
  
  console.log("\nUsage: bun run test-acp.ts <agent> <message>\n");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    await listAvailableAgents();
    return;
  }

  const agentType = args[0] as ACPAgentType;
  const message = args.slice(1).join(" ") || "Hello! What can you do?";

  if (!isACPAgent(agentType)) {
    console.error(`❌ Unknown agent: ${agentType}`);
    await listAvailableAgents();
    process.exit(1);
  }

  const agent = new ACPAgent(agentType);

  // Check availability
  const available = await agent.isAvailable();
  if (!available) {
    console.error(`❌ Agent '${agentType}' is not installed or not in PATH`);
    console.error(`   Command: ${getACPCommand(agentType).join(" ")}`);
    process.exit(1);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`🤖 Agent: ${agentType}`);
  console.log(`📝 Prompt: "${message}"`);
  console.log(`📂 CWD: ${process.cwd()}`);
  console.log(`${"─".repeat(60)}\n`);

  const startTime = Date.now();

  try {
    // Start agent
    await agent.start({
      cwd: process.cwd(),
      onEvent: handleEvent,
      onError: (error) => {
        console.error(`\n❌ Error: ${error.message}`);
      },
    });

    // Create session
    const sessionId = await agent.createSession();
    log("blue", "[SESSION]", `Created: ${sessionId}`);

    // Send prompt
    console.log("\n" + "─".repeat(60));
    console.log("📤 Sending prompt...\n");

    const stopReason = await agent.prompt(message);

    console.log("\n" + "─".repeat(60));
    log("green", "[COMPLETE]", `Stop reason: ${stopReason}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
  } finally {
    await agent.stop();
  }

  // Print statistics
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n📊 Statistics:`);
  console.log(`   Total events: ${stats.total}`);
  console.log(`   By type:`, stats.byType);
  console.log(`   Duration: ${elapsed}s`);
  console.log("");
}

main().catch(console.error);
