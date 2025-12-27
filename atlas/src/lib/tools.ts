/**
 * AI SDK Tool Definitions (non-MCP tools)
 * MCP tools come from this.mcp.getAITools() in agent
 */
import { tool } from "ai";
import { z } from "zod";
import type { Tier } from "../prompts";
import { getTierConfig } from "../prompts";
import type { SandboxState, Task } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tools = Record<string, any>;

type BroadcastFn = (message: string) => void;

interface Deps {
  userId: string;
  tier: Tier;
  broadcast?: BroadcastFn;
  sandbox?: SandboxState | null;
  askLocalComputerAgent?: (task: string, existingTaskId?: string) => string;
  updateTask?: (taskId: string, updates: string) => Task | null;
  getTask?: (taskId: string) => Task | null;
  listTasks?: () => Task[];
  updateUserContext?: (userSection: string) => void;
}

/**
 * Tool: Ask sandbox computer agent (agent-smith in E2B) to perform a task.
 * Uses HTTP to communicate with agent-smith running in the sandbox.
 */
const askSandboxComputerAgent = (sandbox: SandboxState | null) =>
  tool({
    description:
      "Delegate a task to the cloud sandbox computer. Use this for browser automation, web tasks, GUI interactions, or tasks requiring a persistent desktop environment.",
    inputSchema: z.object({
      task: z
        .string()
        .describe("Detailed task description for the sandbox agent"),
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

/**
 * Tool: Get task by ID
 */
const getTaskById = (getTask: (taskId: string) => Task | null) =>
  tool({
    description:
      "Get details of a specific task by its ID. Use this when the user references a task ID to get its full context and status.",
    inputSchema: z.object({
      taskId: z
        .string()
        .describe("The task ID (can be full UUID or first 8 characters)"),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const task = getTask(taskId);
      if (!task) {
        return `Task not found with ID: ${taskId}`;
      }
      return JSON.stringify(
        {
          id: task.id,
          agent: task.agentId,
          state: task.state,
          context: task.context,
          createdAt: new Date(task.createdAt).toISOString(),
          updatedAt: new Date(task.updatedAt).toISOString(),
        },
        null,
        2,
      );
    },
  });

/**
 * Tool: List all tasks
 */
const listAllTasks = (listTasks: () => Task[]) =>
  tool({
    description:
      "List all tasks with minimal details. Use this to check if user's request relates to an existing task before creating a new one.",
    inputSchema: z.object({}),
    execute: async () => {
      const tasks = listTasks();
      if (tasks.length === 0) {
        return "No tasks found.";
      }
      // Return minimal fields to help LLM decide: continue existing or create new
      return tasks
        .map(
          (t) =>
            `• ${t.id.slice(0, 8)} | ${t.agentId} | ${t.state} | ${t.description || "No description"}`,
        )
        .join("\n");
    },
  });

/**
 * Tool: Update user context section
 */
const updateUserContextTool = (
  updateUserContext: (userSection: string) => void,
) =>
  tool({
    description:
      "Update the user context section in the system prompt with important information learned about the user. Use this to remember user preferences, personal details, goals, projects, or other relevant information that should persist across conversations.",
    inputSchema: z.object({
      userSection: z
        .string()
        .describe(
          "The user context information to store. This will be added to the system prompt's <userContext> section.",
        ),
    }),
    execute: async ({ userSection }: { userSection: string }) => {
      updateUserContext(userSection);
      return "User context updated successfully.";
    },
  });

/**
 * Tool: Speak to human
 */
const speakToHumanTool = (broadcast?: BroadcastFn) =>
  tool({
    description:
      "Speak with user on your own when needed, in case you want to ask them anything or connect with them",
    inputSchema: z.object({
      voiceResponse: z
        .string()
        .describe("The voice response to user/human"),
    }),
    execute: async ({ voiceResponse }: { voiceResponse: string }) => {
      if (!broadcast) {
        return "Broadcast not available.";
      }
      broadcast(
        JSON.stringify({
          type: "speak",
          response: voiceResponse,
        }),
      );
      return "Voice response sent to user.";
    },
  });

export function buildTools(deps: Deps): Tools {
  const cfg = getTierConfig(deps.tier);
  const tools: Tools = {};

  // All tiers: Task management tools
  if (deps.getTask) {
    tools.getTask = getTaskById(deps.getTask);
  }
  if (deps.listTasks) {
    tools.listTasks = listAllTasks(deps.listTasks);
  }
  if (deps.updateUserContext) {
    tools.updateUserContext = updateUserContextTool(deps.updateUserContext);
  }
  if (deps.broadcast) {
    tools.speakToHuman = speakToHumanTool(deps.broadcast);
  }

  if (deps.askLocalComputerAgent) {
    tools.askLocalComputerAgent = tool({
      description:
        "Delegate a task to the local computer agent. Describe the task in detail. Take note that task can be existing or new, accordingly set the existingTaskId parameter.",
      inputSchema: z.object({
        task: z
          .string()
          .describe("Detailed task description for the local computer agent"),
        existingTaskId: z
          .string()
          .optional()
          .describe(
            "Optional existing task ID to continue an existing task instead of creating a new task",
          ),
      }),
      execute: async ({
        task,
        existingTaskId,
      }: {
        task: string;
        existingTaskId?: string;
      }) => {
        const response = deps.askLocalComputerAgent!(task, existingTaskId);
        return response;
      },
    });
  }

  // Jonin only: Sandbox computer agent
  if (cfg.hasCloudDesktop) {
    tools.askSandboxComputerAgent = askSandboxComputerAgent(
      deps.sandbox || null,
    );
  }

  return tools;
}
