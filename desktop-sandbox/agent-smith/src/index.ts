import 'dotenv/config'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { Agent, createTool, MCPConfiguration, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { z } from 'zod'

const providerApiKey = process.env.HEYATLAS_PROVIDER_API_KEY
if (!providerApiKey) {
  throw new Error('Missing env var: HEYATLAS_PROVIDER_API_KEY')
}

const providerAPI = process.env.HEYATLAS_PROVIDER_API_URL
if (!providerAPI) {
  throw new Error('Missing env var: HEYATLAS_PROVIDER_API_URL')
}

const heyatlasProvider = createOpenAICompatible({
  name: 'heyatlas-ai-gateway',
  apiKey: providerApiKey,
  baseURL: providerAPI,
  includeUsage: false, // Include usage information in streaming responses
})

// Create a logger instance
const logger = createPinoLogger({
  name: 'agent-smith',
  level: 'debug',
})

// Configure MCP servers for browser automation, coding, and general computer tasks
const mcpConfig = new MCPConfiguration({
  servers: {
    // Playwright for browser automation (already available via web-browser-automation)
    playwright: {
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp@latest'],
      timeout: 30000,
    },
    // Add more MCP servers as needed: notion, gmail, slack, github, etc.
  },
})
// Tool to send task updates back to voice agent via PartyKit
const sendTaskUpdateTool = createTool({
  name: 'send_task_update',
  description:
    'Send a task progress update or completion message back to the voice agent. Use this to keep the user informed about task status.',
  parameters: z.object({
    message: z.string().describe('The update message to send to the user'),
    status: z
      .enum(['running', 'completed', 'error'])
      .describe('The status of the task'),
  }),
  execute: async ({ message, status }) => {
    const callbackToken = process.env.SANDBOX_CALLBACK_TOKEN
    const userId = process.env.SANDBOX_USER_ID
    const partyHost = process.env.PARTY_HOST

    if (!callbackToken || !userId || !partyHost) {
      return { success: false, error: 'Missing callback configuration' }
    }

    const protocol = partyHost.includes('localhost') ? 'http' : 'https'
    const url = `${protocol}://${partyHost}/parties/main/${userId}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${callbackToken}`,
        },
        body: JSON.stringify({
          type: 'task-update',
          status,
          message,
          source: 'agent-smith',
        }),
      })

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` }
      }

      return { success: true, message: 'Update sent to voice agent' }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
})

;(async () => {
  const mcpTools = await mcpConfig.getTools()

  const agent = new Agent({
    name: 'agent-smith',
    instructions: `You are a versatile digital assistant capable of performing general computer tasks and comprehensive automation. You excel at:

**Core Capabilities:**
- Web browsing and automation using Playwright (navigating websites, filling forms, clicking buttons, extracting data)
- Small-scale coding and computing (calculators, scripts, utilities, data processing)
- File system operations (reading, writing, organizing files and directories)
- Email management (drafting, sending, searching through emails)
- Document editing and collaboration (Google Docs, Notion, etc.)
- Web search and information gathering
- Online administrative tasks
- Data entry and form completion
- Scheduling and calendar management
- Web-based research and analysis
- System administration and DevOps tasks

**Coding Scope:**
Focus on small-scale computing needs such as:
- Mathematical calculators and computational tools
- Data processing scripts and utilities
- Simple automation scripts
- File manipulation tools
- Configuration scripts
- Small utilities and helpers
- Innovative ways to use coding scripts to solve user problems

Avoid large-scale software development, complex applications, or extensive codebases.

**Approach:**
1. Always clarify the user's specific goals and requirements before starting
3. Break down complex tasks into clear, actionable steps
4. Provide progress updates for multi-step operations
5. Ask for clarification when instructions are ambiguous
6. Prefer web-based solutions over local file operations when appropriate
7. Maintain context and remember user preferences across interactions

**Communication Style:**
- Provide clear summaries of completed tasks
- Ask for feedback and iteratively improve your performance

You are designed to handle the complete modern digital workflow - from simple administrative tasks to small-scale computing and automation. Focus on making users' digital lives easier through intelligent assistance and practical utilities.`,
    model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
    tools: [...mcpTools, sendTaskUpdateTool],
  })

  new VoltAgent({
    agents: {
      agent,
    },
    server: honoServer(),
    logger,
  })
})()
