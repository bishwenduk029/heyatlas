/**
 * AI SDK Tool Definitions (non-MCP tools)
 * MCP tools come from this.mcp.getAITools() in agent
 */
import { tool } from "ai";
import { z } from "zod";
import type { Tier } from "../prompts";
import { getTierConfig } from "../prompts";
import type { MemoryClient } from "../memory";
import type { SandboxState } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tools = Record<string, any>;

type BroadcastFn = (message: string) => void;

interface Deps {
  userId: string;
  tier: Tier;
  memory: MemoryClient | null;
  broadcast?: BroadcastFn;
  sandbox?: SandboxState | null;
}

/**
 * Tool: Ask local coding agent (CLI) to perform a task.
 * Broadcasts task via WebSocket to connected CLI agents.
 */
const askLocalCodingAgent = (broadcast?: BroadcastFn) =>
  tool({
    description:
      "Delegate a coding or computer task to the local CLI agent running on the user's machine. Use this for file operations, code editing, running commands, etc.",
    inputSchema: z.object({
      task: z.string().describe("Detailed task description for the coding agent"),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }),
    execute: async ({ task, priority }: { task: string; priority: string }) => {
      if (!broadcast) {
        return "Local coding agent not available. No CLI connected.";
      }

      // Broadcast task to connected CLI agents
      broadcast(
        JSON.stringify({
          type: "task",
          content: task,
          priority,
          source: "atlas",
        }),
      );

      return `Task delegated to local coding agent: "${task.substring(0, 100)}...". You will be notified when complete.`;
    },
  });

/**
 * Tool: Ask sandbox computer agent (agent-smith in E2B) to perform a task.
 * Uses HTTP to communicate with agent-smith running in the sandbox.
 */
const askSandboxComputerAgent = (sandbox: SandboxState | null) =>
  tool({
    description:
      "Delegate a task to the cloud sandbox computer. Use this for browser automation, web tasks, GUI interactions, or tasks requiring a persistent desktop environment.",
    inputSchema: z.object({
      task: z.string().describe("Detailed task description for the sandbox agent"),
    }),
    execute: async ({ task }: { task: string }) => {
      if (!sandbox?.computerAgentUrl) {
        return "Cloud sandbox not available. Sandbox may still be starting up.";
      }

      try {
        const res = await fetch(sandbox.computerAgentUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: task,
            userId: sandbox.sandboxId,
          }),
        });

        if (!res.ok) {
          return `Sandbox task failed: ${res.statusText}`;
        }

        // agent-smith will send task-update via HTTP callback
        return `Task sent to cloud sandbox: "${task.substring(0, 100)}...". You will be notified when complete.`;
      } catch (e) {
        return `Sandbox error: ${e}`;
      }
    },
  });

const saveMemory = (mem: MemoryClient, userId: string) =>
  tool({
    description: "Save information about the user to memory",
    inputSchema: z.object({ memory: z.string().describe("Information to save") }),
    execute: async ({ memory }: { memory: string }) => {
      try {
        await mem.add([{ role: "user", content: memory }], { user_id: userId });
        return `Saved: ${memory}`;
      } catch (e) {
        return `Failed: ${e}`;
      }
    },
  });

const searchMemory = (mem: MemoryClient, userId: string) =>
  tool({
    description: "Search stored memories about the user",
    inputSchema: z.object({ query: z.string().describe("Search query"), limit: z.number().default(5) }),
    execute: async ({ query, limit }: { query: string; limit: number }) => {
      try {
        const results = await mem.search(query, { user_id: userId, limit });
        if (!results || !(results as unknown[]).length) return "No memories found.";
        return (results as { memory: string }[]).map((r) => `• ${r.memory}`).join("\n");
      } catch (e) {
        return `Failed: ${e}`;
      }
    },
  });

export function buildTools(deps: Deps): Tools {
  const cfg = getTierConfig(deps.tier);
  const tools: Tools = {};

  // All tiers: Local coding agent (CLI)
  tools.askLocalCodingAgent = askLocalCodingAgent(deps.broadcast);

  // Jonin only: Sandbox computer agent
  if (cfg.hasCloudDesktop) {
    tools.askSandboxComputerAgent = askSandboxComputerAgent(deps.sandbox || null);
  }

  // Chunin+: Memory tools
  if (cfg.hasMemory && deps.memory) {
    tools.saveMemory = saveMemory(deps.memory, deps.userId);
    tools.searchMemories = searchMemory(deps.memory, deps.userId);
  }

  return tools;
}
