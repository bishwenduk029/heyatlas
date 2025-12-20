import { createTool } from '@voltagent/core'
import { z } from 'zod'

// Store for broadcast callback - set by the agent handler
let broadcastCallback: ((task: string, agent?: string) => Promise<boolean>) | null = null

export function setBroadcastCallback(cb: typeof broadcastCallback) {
  broadcastCallback = cb
}

export const askComputerAgentTool = createTool({
  name: 'ask_computer_agent',
  description: 'Delegate a computer task to the computer agent for execution. Use this when the user wants you to perform actions on their computer like browsing, coding, file operations, or any automated task.',
  parameters: z.object({
    task_description: z.string().describe('A clear description of the task to be executed by the computer agent'),
  }),
  execute: async ({ task_description }) => {
    if (!broadcastCallback) {
      return 'Cannot execute task: Not connected to a user session. The broadcast callback is not set.'
    }

    try {
      const success = await broadcastCallback(task_description, 'opencode')

      if (success) {
        return 'The task has been started. I will notify you when it is complete.'
      } else {
        return 'Failed to start task - connection to computer may be lost.'
      }
    } catch (error) {
      console.error('[Atlas] Task delegation error:', error)
      return `Error connecting to task automation: ${String(error)}`
    }
  },
})
