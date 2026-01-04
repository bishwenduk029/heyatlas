import 'dotenv/config'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { PlanAgent, VoltAgent, NodeFilesystemBackend } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { mcpConfig } from './config'
import {
  BROWSER_AUTOMATION_PROMPT,
  DOCUMENT_WRITER_PROMPT,
  FORMAT_CONVERTER_PROMPT,
  MARKDOWN_CONVERTER_PROMPT,
  ORCHESTRATOR_PROMPT,
  PLANNING_PROMPT,
  PRESENTATION_CREATOR_PROMPT,
  FILESYSTEM_PROMPT,
} from './prompts'
import { sendTaskUpdateTool } from './tools'

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
  includeUsage: false,
})

const logger = createPinoLogger({
  name: 'agent-smith',
  level: 'debug',
})
;(async () => {
  const toolsets = await mcpConfig.getToolsets()

  const workflowAgent = new PlanAgent({
    name: 'workflow-orchestrator',
    systemPrompt: ORCHESTRATOR_PROMPT,
    model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
    tools: [sendTaskUpdateTool],
    filesystem: {
      backend: new NodeFilesystemBackend({
        rootDir: process.cwd(),
        virtualMode: false,
      }),
    },
    subagents: [
      {
        name: 'markdown-converter',
        purpose:
          'Convert documents (PDF, Word, Excel, images, audio) to Markdown format',
        systemPrompt: MARKDOWN_CONVERTER_PROMPT,
        model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
        tools: toolsets.markitdown?.getTools() || [],
      },
      {
        name: 'browser-automation',
        purpose:
          'Execute web automation workflows including form filling, data extraction, navigation, and research tasks',
        systemPrompt: BROWSER_AUTOMATION_PROMPT,
        model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
        tools: toolsets.browser?.getTools() || [],
      },
      {
        name: 'presentation-creator',
        purpose: 'Create and edit PowerPoint presentations',
        systemPrompt: PRESENTATION_CREATOR_PROMPT,
        model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
        tools: toolsets.powerpoint?.getTools() || [],
      },
      {
        name: 'document-writer',
        purpose: 'Create and edit Word documents',
        systemPrompt: DOCUMENT_WRITER_PROMPT,
        model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
        tools: toolsets.word?.getTools() || [],
      },
      {
        name: 'format-converter',
        purpose: 'Convert between various document formats using Pandoc',
        systemPrompt: FORMAT_CONVERTER_PROMPT,
        model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
        tools: toolsets.pandoc?.getTools() || [],
      },
    ],
    planning: {
      systemPrompt: PLANNING_PROMPT,
    },
    summarization: {
      triggerTokens: 150_000,
      keepMessages: 10,
    },
  })

  new VoltAgent({
    agents: {
      'workflow-orchestrator': workflowAgent,
    },
    server: honoServer(),
    logger,
  })
})()
