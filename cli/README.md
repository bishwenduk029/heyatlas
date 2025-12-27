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
