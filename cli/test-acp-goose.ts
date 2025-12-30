#!/usr/bin/env npx tsx
/**
 * Test script to run goose ACP agent in isolation and observe event streaming.
 * Run: npx tsx test-acp-goose.ts
 */

import { ACPAgent, isACPAgent } from "./agents/acp";
import type { StreamEvent } from "./agents/types";

const AGENT = "goose";
const TASK = "Create a simple hello.py file that prints 'Hello from Goose!' and then read it back to verify.";

// Color helpers for terminal output
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function formatEvent(event: StreamEvent): string {
  const { type, data } = event;
  const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 12) || "";
  
  switch (type) {
    case "message": {
      const role = data.role as string;
      const content = data.content as string;
      const delta = data.delta ? " (delta)" : "";
      const color = role === "user" ? colors.cyan : colors.green;
      const truncated = content.length > 100 ? content.slice(0, 100) + "..." : content;
      return `${colors.dim}${timestamp}${colors.reset} ${color}[${type}]${colors.reset} ${role}${delta}: "${truncated}"`;
    }
    
    case "tool_call": {
      const name = data.name as string;
      const status = data.status as string;
      const kind = data.kind as string;
      return `${colors.dim}${timestamp}${colors.reset} ${colors.yellow}[${type}]${colors.reset} ${name} (${kind}) - ${status}`;
    }
    
    case "tool_update": {
      const id = data.id as string;
      const status = data.status as string;
      const content = data.content ? JSON.stringify(data.content).slice(0, 80) : "";
      return `${colors.dim}${timestamp}${colors.reset} ${colors.yellow}[${type}]${colors.reset} ${id.slice(0, 8)}... - ${status} ${content}`;
    }
    
    case "thinking": {
      const content = (data.content as string) || "";
      const truncated = content.length > 80 ? content.slice(0, 80) + "..." : content;
      return `${colors.dim}${timestamp}${colors.reset} ${colors.magenta}[${type}]${colors.reset} ${truncated}`;
    }
    
    case "plan": {
      const entries = data.entries as Array<{ title?: string; content?: string }>;
      const titles = entries?.map(e => e.title || e.content).join(", ") || "";
      return `${colors.dim}${timestamp}${colors.reset} ${colors.blue}[${type}]${colors.reset} ${titles}`;
    }
    
    case "status": {
      const msg = (data.message as string) || (data.status as string) || JSON.stringify(data);
      return `${colors.dim}${timestamp}${colors.reset} ${colors.dim}[${type}]${colors.reset} ${msg}`;
    }
    
    case "permission": {
      const title = data.title as string;
      return `${colors.dim}${timestamp}${colors.reset} ${colors.red}[${type}]${colors.reset} ${title}`;
    }
    
    default:
      return `${colors.dim}${timestamp}${colors.reset} [${type}] ${JSON.stringify(data).slice(0, 100)}`;
  }
}

// Stats
const stats = {
  byType: {} as Record<string, number>,
  messageChunks: 0,
  totalMessages: "",
};

function recordEvent(event: StreamEvent) {
  stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
  
  if (event.type === "message" && event.data.delta) {
    stats.messageChunks++;
    stats.totalMessages += (event.data.content as string) || "";
  }
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing ACP Agent: ${AGENT}`);
  console.log(`Task: "${TASK}"`);
  console.log(`${"=".repeat(60)}\n`);

  if (!isACPAgent(AGENT)) {
    console.error(`Error: ${AGENT} is not a valid ACP agent`);
    process.exit(1);
  }

  const agent = new ACPAgent(AGENT);

  // Check availability
  const available = await agent.isAvailable();
  if (!available) {
    console.error(`Error: ${AGENT} is not installed or not in PATH`);
    console.error(`Install goose: https://block.github.io/goose/docs/getting-started/installation`);
    process.exit(1);
  }

  console.log(`✅ ${AGENT} is available\n`);
  console.log(`${"─".repeat(60)}`);
  console.log("Event Stream:");
  console.log(`${"─".repeat(60)}\n`);

  try {
    const stopReason = await agent.run(TASK, {
      cwd: process.cwd(),
      onEvent: (event) => {
        recordEvent(event);
        console.log(formatEvent(event));
      },
      onComplete: (reason) => {
        console.log(`\n${colors.green}✅ Completed: ${reason}${colors.reset}`);
      },
      onError: (error) => {
        console.error(`\n${colors.red}❌ Error: ${error.message}${colors.reset}`);
      },
    });

    console.log(`\n${"─".repeat(60)}`);
    console.log("Results:");
    console.log(`${"─".repeat(60)}`);
    console.log(`Stop reason: ${stopReason}`);
    console.log(`\nEvent counts:`, stats.byType);
    console.log(`Message chunks received: ${stats.messageChunks}`);
    console.log(`\nAccumulated assistant message (${stats.totalMessages.length} chars):`);
    console.log(`"${stats.totalMessages.slice(0, 500)}${stats.totalMessages.length > 500 ? "..." : ""}"`);

  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
