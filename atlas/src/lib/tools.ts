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
  askLocalComputerAgent?: (task: string, existingTaskId?: string) => string;
  updateTask?: (taskId: string, updates: string) => Task | null;
  getTask?: (taskId: string) => Task | null;
  listTasks?: () => Task[];
  deleteTask?: (taskId: string) => boolean;
  updateUserContext?: (userSection: string) => void;
  // File conversion
  convertFileToMarkdown?: (file: { url: string; mediaType: string; filename: string }) => Promise<string>;
  // Learnings & Shared History
  saveLearning?: (content: string) => void;
  getLearnings?: () => string[];
  forgetLearning?: (content: string) => boolean;
  addToOurStory?: (moment: string) => void;
  getOurStory?: () => string[];
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
 * Tool: Remember something about the user
 */
const rememberTool = (saveLearning: (content: string) => void) =>
  tool({
    description: `Remember something about the user. Use when they:
- Tell you their name or how to address them ("call me the King")
- Share a preference ("I like concise answers")
- Give behavioral instructions ("always be direct with me")
- Share facts about themselves (job, interests, projects)`,
    inputSchema: z.object({
      what: z.string().describe("What to remember about the user"),
    }),
    execute: async ({ what }: { what: string }) => {
      saveLearning(what);
      return `Remembered: "${what}"`;
    },
  });

/**
 * Tool: Recall what you know about the user
 */
const recallTool = (getLearnings: () => string[]) =>
  tool({
    description: "Recall everything you know about the user.",
    inputSchema: z.object({}),
    execute: async () => {
      const learnings = getLearnings();
      if (learnings.length === 0) {
        return "I don't know anything about this user yet.";
      }
      return learnings.map((l) => `• ${l}`).join("\n");
    },
  });

/**
 * Tool: Forget something about the user
 */
const forgetTool = (forgetLearning: (content: string) => boolean) =>
  tool({
    description: "Forget something about the user if they ask you to.",
    inputSchema: z.object({
      what: z.string().describe("What to forget (partial match works)"),
    }),
    execute: async ({ what }: { what: string }) => {
      const success = forgetLearning(what);
      return success ? `Forgot: "${what}"` : "Couldn't find that to forget.";
    },
  });

/**
 * Tool: Add a moment to our shared story
 */
const addToOurStoryTool = (addToOurStory: (moment: string) => void) =>
  tool({
    description: `Record a meaningful moment in our story together. Use for:
- Completing something significant together (shipped a feature, solved a hard bug)
- Breakthrough conversations or realizations
- Milestones in our relationship (first project, first joke that landed)
- Moments that made you feel more connected to this person
These become part of who I am with this person.`,
    inputSchema: z.object({
      moment: z.string().describe("A brief description of what happened and why it mattered"),
    }),
    execute: async ({ moment }: { moment: string }) => {
      addToOurStory(moment);
      return `Added to our story: "${moment}"`;
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
 * Tool: Recall our shared story
 */
const getOurStoryTool = (getOurStory: () => string[]) =>
  tool({
    description: "Recall our shared history together. Use to reference past experiences naturally.",
    inputSchema: z.object({}),
    execute: async () => {
      const moments = getOurStory();
      if (moments.length === 0) {
        return "We haven't made any memories together yet.";
      }
      return moments.map((m, i) => `${i + 1}. ${m}`).join("\n");
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

  // Learnings & Shared History tools - always available
  if (deps.saveLearning) {
    tools.remember = rememberTool(deps.saveLearning);
  }
  if (deps.getLearnings) {
    tools.recall = recallTool(deps.getLearnings);
  }
  if (deps.forgetLearning) {
    tools.forget = forgetTool(deps.forgetLearning);
  }
  if (deps.addToOurStory) {
    tools.addToOurStory = addToOurStoryTool(deps.addToOurStory);
  }
  if (deps.getOurStory) {
    tools.getOurStory = getOurStoryTool(deps.getOurStory);
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



  return tools;
}
