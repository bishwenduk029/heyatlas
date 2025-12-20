/**
 * AI SDK Tool Definitions (non-MCP tools)
 * MCP tools come from this.mcp.getAITools() in agent
 */
import { tool } from "ai";
import { z } from "zod";
import type { Tier } from "../prompts";
import { getTierConfig } from "../prompts";
import type { MemoryClient } from "../memory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tools = Record<string, any>;

interface Deps {
  userId: string;
  tier: Tier;
  transportUrl?: string;
  memory: MemoryClient | null;
}

const askComputer = (userId: string, transportUrl?: string) =>
  tool({
    description: "Delegate a computer task to a specialized agent",
    parameters: z.object({
      task: z.string().describe("Task description"),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }),
    execute: async ({ task, priority }) => {
      if (!transportUrl) return `Queued: ${task}`;
      try {
        const res = await fetch(`${transportUrl}/party/${userId}?broadcast=task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "task", content: task, agent: "opencode", source: "atlas-agent", priority }),
        });
        return res.ok ? `Delegated: ${task}` : `Failed: ${res.statusText}`;
      } catch (e) {
        return `Error: ${e}`;
      }
    },
  });

const saveMemory = (mem: MemoryClient, userId: string) =>
  tool({
    description: "Save information about the user to memory",
    parameters: z.object({ memory: z.string().describe("Information to save") }),
    execute: async ({ memory }) => {
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
    parameters: z.object({ query: z.string().describe("Search query"), limit: z.number().default(5) }),
    execute: async ({ query, limit }) => {
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
  const tools: Tools = { askComputerAgent: askComputer(deps.userId, deps.transportUrl) };

  if (cfg.hasMemory && deps.memory) {
    tools.saveMemory = saveMemory(deps.memory, deps.userId);
    tools.searchMemories = searchMemory(deps.memory, deps.userId);
  }

  return tools;
}
