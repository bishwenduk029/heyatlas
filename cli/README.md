# HeyAtlas CLI

A lightweight CLI tool to connect local AI agents to HeyAtlas cloud infrastructure for voice-powered interactions.

## Installation

```bash
npm install -g heyatlas
```

Or with yarn:

```bash
yarn global add heyatlas
```

## Quick Start

```bash
heyatlas login
heyatlas connect
```

## Features

- 🔒 **Local-first security** - Your computer initiates the connection; no incoming ports needed
- ⚡ **Real-time voice interface** - WebSocket-based communication with low-latency voice interaction
- 🛠️ **Agent agnostic** - Works with any CLI-based local agent (OpenCode, Goose, etc.)
- 🔑 **Bring Your Own Keys** - Manage your own API credentials securely

## Configuration

The CLI stores configuration in `~/.heyatlas/` including:
- Authentication credentials
- Agent connection settings

Set `HEYATLAS_API` environment variable to use a custom API endpoint:

```bash
export HEYATLAS_API=https://custom.heyatlas.app
heyatlas login
```

## Optional web research with OpenCode

Give the OpenCode agent you connect to HeyAtlas web search and page fetching with
[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp).
The anonymous endpoint needs no Parallel account or API key; search uses Fast mode.
It is intended for exploration and light use, with rate limits.

With [OpenCode installed](https://opencode.ai/docs/) and its model provider
configured, add this to `opencode.json` in the project you want the agent to work
in. If you already have `opencode.json` or `opencode.jsonc`, merge the
`parallel-search` entry into its existing `mcp` object, keeping your other settings.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "parallel-search": {
      "type": "remote",
      "url": "https://search.parallel.ai/mcp",
      "oauth": false,
      "headers": {
        "User-Agent": "HeyAtlas-OpenCode"
      },
      "enabled": true
    }
  }
}
```

From that same project directory, check that `parallel-search` is connected,
then connect OpenCode to HeyAtlas:

```bash
opencode mcp list
npx heyatlas connect opencode
```

Ask HeyAtlas to delegate a research task to the connected agent, for example:
"Use the parallel-search MCP tools to find the latest Cloudflare Workers release
notes, fetch the relevant page, and summarize the changes with source URLs."

This adds tools to the connected OpenCode agent. HeyAtlas sign-in and your model
provider setup are still required. To disable this server, set its `enabled` field
to `false` and restart the connection. See the
[OpenCode MCP guide](https://opencode.ai/docs/mcp-servers/) for more configuration
options.

## Environment Variables

- `HEYATLAS_API` - Override the default API endpoint (default: https://www.heyatlas.app)
- `DEBUG` - Enable debug logging

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build
bun run build

# Start
bun run start
```

## License

MIT - See LICENSE file for details

## Support

For issues, questions, or contributions, visit the [HeyAtlas GitHub repository](https://github.com/yourusername/heyatlas)
