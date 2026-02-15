/**
 * AI SDK Tool Definitions (non-MCP tools)
 * MCP tools come from this.mcp.getAITools() in agent
 */
import { tool } from "ai";
import { z } from "zod";
import type { Tier } from "../prompts";
import { getTierConfig } from "../prompts";
import type { SandboxMetadata, Task } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tools = Record<string, any>;

type BroadcastFn = (message: string) => void;

interface Deps {
  userId: string;
  tier: Tier;
  broadcast?: BroadcastFn;
  sandbox?: SandboxMetadata | null;
  /** @deprecated Use handOffToAgent */
  handOffToSmith?: (task: string, existingTaskId?: string) => Promise<string>;
  /** Hand off task to a specific agent */
  handOffToAgent?: (task: string, assignedAgent: string, existingTaskId?: string) => Promise<string>;
  /** Get list of connected agents */
  getConnectedAgents?: () => Array<{ id: string; type: "local" | "sandbox" }>;
  updateTask?: (taskId: string, updates: string) => Task | null;
  getTask?: (taskId: string) => Task | null;
  listTasks?: () => Task[];
  deleteTask?: (taskId: string) => boolean;
  updateUserContext?: (userSection: string) => void;
  // File conversion
  convertFileToMarkdown?: (file: { url: string; mediaType: string; filename: string }) => Promise<string>;
  // Memory
  remember?: (type: "user_detail" | "user_preference", content: string) => void;
  // Sandbox URL
  getSandboxPortUrl?: (port: number) => Promise<{ url: string; sandboxId: string } | null>;
  getSandboxFileDownloadUrl?: (path: string) => Promise<string | null>;
  // Mini Computer
  toggleMiniComputer?: (enabled: boolean) => Promise<{ success: boolean; vncUrl?: string; error?: string }>;
  isMiniComputerActive?: () => boolean;
  // Self-healing: trigger memory compression + state reset
  compressMemory?: () => Promise<string>;
}



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
 * Tool: Delete a task by ID
 */
const deleteTaskTool = (deleteTask: (taskId: string) => boolean) =>
  tool({
    description:
      "Delete a task by its ID. Use this when the user explicitly requests to remove a task. This action cannot be undone.",
    inputSchema: z.object({
      taskId: z
        .string()
        .describe("The task ID to delete (can be full UUID or first 8 characters)"),
    }),
    execute: async ({ taskId }: { taskId: string }) => {
      const success = deleteTask(taskId);
      if (!success) {
        return `Task not found with ID: ${taskId}`;
      }
      return `Task deleted successfully.`;
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

/**
 * Tool: Remember user details or preferences
 */
const rememberTool = (remember: (type: "user_detail" | "user_preference", content: string) => void) =>
  tool({
    description: `Remember something about the user. Use this to persist:
- user_detail: Facts about the user (name, job, family, relationships, interests, personal info)
- user_preference: How the user wants you to behave (style, instructions, do's and don'ts)`,
    inputSchema: z.object({
      type: z.enum(["user_detail", "user_preference"]).describe("Type of memory"),
      what: z.string().describe("What to remember"),
    }),
    execute: async ({ type, what }: { type: "user_detail" | "user_preference"; what: string }) => {
      remember(type, what);
      return `Remembered ${type}: "${what}"`;
    },
  });

/**
 * Tool: Convert file to markdown using Workers AI
 */
const convertFileToMarkdownTool = (convertFileToMarkdown?: (file: { url: string; mediaType: string; filename: string }) => Promise<string>) =>
  tool({
    description:
      "Convert one or more files (images, PDFs, documents) to readable markdown text. Use when you need to understand the content of files mentioned in the user's message. Pass an array of URLs.",
    inputSchema: z.object({
      urls: z.array(z.string()).describe("Array of file URLs to convert to markdown"),
    }),
    execute: async ({ urls }: { urls: string[] }) => {
      if (!convertFileToMarkdown) {
        return "File conversion tool not available.";
      }
      
      const results = [];
      for (const url of urls) {
        const filename = url.split('/').pop() || 'file';
        const ext = filename.split('.').pop()?.toLowerCase();
        const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'png' ? 'image/png' : 
                         ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
        
        const markdown = await convertFileToMarkdown({ url, mediaType, filename });
        results.push(markdown);
      }
      
      return results.join("\n\n");
    },
  });

/**
 * Tool: Generate image using Workers AI Flux model
 * 
 * NOTE: toModelOutput returns TEXT only because most models don't support vision.
 * The image data URL is returned in the tool result for UI rendering.
 * The model receives just a text confirmation.
 */
export const generateImageTool = (generateImage: (prompt: string) => Promise<string>) =>
  tool({
    description:
      "Generate an image from a text description using AI. The image will be displayed automatically in the chat - DO NOT try to embed the image in markdown or reference any URLs.",
    inputSchema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate. Be specific about style, colors, composition, and content."),
    }),
    execute: async ({ prompt }: { prompt: string }) => {
      const base64 = await generateImage(prompt);
      // Return data URL for UI display
      return `data:image/jpeg;base64,${base64}`;
    },
    // Return simple text to the model - the UI will render the image from the tool result
    toModelOutput: () => ({
      type: "content" as const,
      value: [{ type: "text" as const, text: "Image generated and displayed to user." }],
    }),
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
  if (deps.deleteTask) {
    tools.deleteTask = deleteTaskTool(deps.deleteTask);
  }
  if (deps.updateUserContext) {
    tools.updateUserContext = updateUserContextTool(deps.updateUserContext);
  }
  if (deps.broadcast) {
    tools.speakToHuman = speakToHumanTool(deps.broadcast);
  }

  // File conversion tool
  if (deps.convertFileToMarkdown) {
    tools.convert_file_to_markdown = convertFileToMarkdownTool(deps.convertFileToMarkdown);
  }

  // Memory tool
  if (deps.remember) {
    tools.remember = rememberTool(deps.remember);
  }

  // Hand off task to a specific connected agent
  if (deps.handOffToAgent && deps.getConnectedAgents) {
    tools.handOffToAgent = tool({
      description:
        "Hand off a task to a connected agent. Use listConnectedAgents first to see available agents. Local agents control the user's computer, sandbox agents run in isolated cloud environments.",
      inputSchema: z.object({
        task: z.string().describe("Detailed task description for the agent"),
        assignedAgent: z.string().describe("Agent ID (e.g., 'smith', 'opencode')"),
        existingTaskId: z.string().optional().describe("Optional task ID to continue"),
      }),
      execute: async ({ task, assignedAgent, existingTaskId }) => {
        return deps.handOffToAgent!(task, assignedAgent, existingTaskId);
      },
    });

    tools.listConnectedAgents = tool({
      description: "List all agents currently connected to Atlas.",
      inputSchema: z.object({}),
      execute: async () => {
        const agents = deps.getConnectedAgents!();
        if (agents.length === 0) {
          return "No agents connected. Run 'npx heyatlas connect <agent>' to connect.";
        }
        return agents.map(a => `- ${a.id} (${a.type})`).join("\n");
      },
    });
  }

  // Sandbox URL tool - get public URL for a port in the coding agent sandbox
  if (deps.getSandboxPortUrl) {
    tools.getSandboxUrl = tool({
      description:
        "Get the public URL for a port exposed by the coding agent sandbox. Use when the agent runs a dev server or any service on a specific port and you need to share the URL with the user.",
      inputSchema: z.object({
        port: z
          .number()
          .describe("The port number to get the public URL for (e.g., 3000 for dev server, 8080 for API)"),
      }),
      execute: async ({ port }: { port: number }) => {
        const result = await deps.getSandboxPortUrl!(port);
        if (!result) {
          return "No active coding agent sandbox. Please start a cloud agent first.";
        }
        return `Public URL for port ${port}: ${result.url} (sandbox: ${result.sandboxId})`;
      },
    });
  }

  // Sandbox file download tool - get download URL for a file in the sandbox
  if (deps.getSandboxFileDownloadUrl) {
    tools.getSandboxFileDownloadUrl = tool({
      description:
        "Get a download URL for a file from the mini-computer sandbox. Use when Smith creates a file (document, image, export, etc.) that the user needs to download.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("The absolute path to the file in the sandbox (e.g., /home/user/output.pdf, /home/user/report.docx)"),
      }),
      execute: async ({ path }: { path: string }) => {
        const url = await deps.getSandboxFileDownloadUrl!(path);
        if (!url) {
          return "No active mini-computer sandbox. The file cannot be accessed.";
        }
        return `Download URL: ${url}`;
      },
    });
  }

  // Toggle mini-computer (e2b desktop with smith)
  if (deps.toggleMiniComputer && deps.isMiniComputerActive !== undefined) {
    tools.toggleMiniComputer = tool({
      description:
        "Start or stop the mini-computer (e2b desktop sandbox with Smith agent). Use this when the user wants to start Smith for web research, document processing, or cloud-based tasks. Also use to stop/shutdown the mini-computer when done.",
      inputSchema: z.object({
        enabled: z
          .boolean()
          .describe("true to start the mini-computer, false to stop it"),
      }),
      execute: async ({ enabled }: { enabled: boolean }) => {
        const wasActive = deps.isMiniComputerActive!();
        
        if (enabled && wasActive) {
          return "Mini-computer is already active.";
        }
        
        if (!enabled && !wasActive) {
          return "Mini-computer is already stopped.";
        }
        
        const result = await deps.toggleMiniComputer!(enabled);
        
        if (result.success) {
          if (enabled) {
            return `Mini-computer started successfully. VNC URL: ${result.vncUrl || "N/A"}`;
          } else {
            return "Mini-computer stopped successfully.";
          }
        } else {
          return `Failed to ${enabled ? "start" : "stop"} mini-computer: ${result.error || "Unknown error"}`;
        }
      },
    });
  }

  // Self-healing: compress memory and reset state
  if (deps.compressMemory) {
    tools.compressMemory = tool({
      description:
        "Compress conversation memory and reset internal state. Use when: conversation is getting long, you notice your responses degrading, tool calls are failing, or context feels stale. This clears cached prompts, trims memory, and gives you a fresh start.",
      inputSchema: z.object({}),
      execute: async () => {
        return deps.compressMemory!();
      },
    });
  }

  return tools;
}
