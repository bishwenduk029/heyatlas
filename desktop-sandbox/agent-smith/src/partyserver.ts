import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
  Agent,
  AgentRegistry,
  WorkflowRegistry,
  TriggerRegistry,
} from '@voltagent/core'
import { serverlessHono } from '@voltagent/serverless-hono'
import { Server, routePartykitRequest } from 'partyserver'

let initialized = false
let serverlessProvider: ReturnType<ReturnType<typeof serverlessHono>>

function initializeAgent(env: Record<string, unknown>) {
  if (initialized) return

  const providerApiKey = env.HEYATLAS_PROVIDER_API_KEY as string
  const providerAPI = env.HEYATLAS_PROVIDER_API_URL as string

  if (!providerApiKey || !providerAPI) {
    throw new Error(
      'Missing env vars: HEYATLAS_PROVIDER_API_KEY or HEYATLAS_PROVIDER_API_URL'
    )
  }

  const heyatlasProvider = createOpenAICompatible({
    name: 'heyatlas-ai-gateway',
    apiKey: providerApiKey,
    baseURL: providerAPI,
    includeUsage: false,
  })

  const agent = new Agent({
    name: 'agent-smith',
    instructions: 'You are a helpful assistant.',
    model: heyatlasProvider('Baseten/zai-org/GLM-4.6'),
  })

  const agentRegistry = AgentRegistry.getInstance()
  agentRegistry.registerAgent(agent)

  serverlessProvider = serverlessHono()({
    agentRegistry,
    workflowRegistry: WorkflowRegistry.getInstance(),
    triggerRegistry: TriggerRegistry.getInstance(),
  })

  initialized = true
}

export class VoltAgentPartyServer extends Server {
  async onRequest(request: Request): Promise<Response> {
    return serverlessProvider.handleRequest(request)
  }
}

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown>
  ): Promise<Response> {
    initializeAgent(env)

    const partyResponse = await routePartykitRequest(request, env)
    if (partyResponse) return partyResponse

    return serverlessProvider.handleRequest(request)
  },
}
