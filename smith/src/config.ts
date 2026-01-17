import { MCPConfiguration } from '@voltagent/core'
import path from 'node:path'

export const mcpConfig = new MCPConfiguration({
  servers: {
    browser: {
      type: 'stdio',
      command: 'uvx',
      args: ["--from", "browser-use[cli]", "browser-use", "--mcp"],
      timeout: 60000,
    },
    markitdown: {
      type: 'stdio',
      command: 'uvx',
      args: ['markitdown-mcp'],
    },
    powerpoint: {
      type: 'stdio',
      command: 'uvx',
      args: [
        '--from',
        'office-powerpoint-mcp-server',
        'ppt_mcp_server',
        '--transport',
        'stdio',
      ],
      timeout: 60000,
    },
    word: {
      type: 'stdio',
      command: 'uvx',
      args: ['--from', 'office-word-mcp-server', 'word_mcp_server'],
      timeout: 60000,
    },
    pandoc: {
      type: 'stdio',
      command: 'uvx',
      args: ['mcp-pandoc'],
      timeout: 60000,
    },
    filesystem: {
      type: 'stdio',
      command: 'npx',
      args: [
        "-y",
        '@wonderwhy-er/desktop-commander@latest',
      ],
      env: { NODE_ENV: 'production' },
      timeout: 10000,
    },
  },
})
