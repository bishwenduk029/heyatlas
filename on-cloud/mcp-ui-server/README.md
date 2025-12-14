# MCP UI Server

A Cloudflare Workers-based UI server for the Nirmanus voice agent system. Provides a web interface for collecting user inputs that are difficult to communicate via voice (URLs, phone numbers, credentials, etc.).

The MCP UI Server integrates seamlessly with the Voice Agent's desktop viewer as a "Text Input" tab, allowing users to fill out forms when the agent needs structured input.

## Architecture

Built with:
- **Bun**: Fast JavaScript runtime
- **Hono.js**: Lightweight web framework for Cloudflare Workers
- **MCP (Model Context Protocol)**: Standard for tool integration with AI agents

## Features

- Plain text input form UI for collecting user inputs
- MCP-compatible tool interface for voice agent integration
- Cloudflare Workers compatible for edge deployment
- HTML5 form with real-time character counter
- PostMessage communication for parent window integration
- **Desktop Viewer Integration**: Renders as "Text Input" tab in web application
- **Theme-Aware**: Automatically adapts to light/dark mode and matches web app colors
- **Multiple Input Types**: Text, email, tel, URL, password, textarea

## Development

### Prerequisites
- Bun (1.0+)
- Wrangler CLI for local development

### Setup

```bash
cd mcp-ui-server
bun install
```

### Local Development

```bash
bun run dev
```

Server runs on `http://localhost:8787`

## API Endpoints

### Health Check
```
GET /health
```

### MCP Tools List
```
GET /mcp/tools
```

Returns available MCP tools the voice agent can call.

### Call MCP Tool
```
POST /mcp/tools/call
Content-Type: application/json

{
  "toolName": "display_text_input",
  "input": {
    "prompt": "Enter your email address",
    "inputType": "email",
    "placeholder": "user@example.com"
  }
}
```

### Text Input Form UI
```
GET /ui/text-input?prompt=Your+Question
```

### Text Input Submission
```
POST /ui/text-input/submit
Content-Type: application/x-www-form-urlencoded

userInput=user+provided+value
```

## MCP Tools

### display_text_input

Display a text input form to the user.

**Parameters:**
- `prompt` (required): The label/prompt to show the user
- `placeholder`: Hint text for the input field
- `inputType`: HTML input type (text, email, tel, url, password)
- `multiline`: Use textarea for multi-line input (default: false)
- `maxLength`: Maximum character length (default: 500)

**Example from Voice Agent:**

```python
async def handle_text_input_request(prompt: str, input_type: str = "text"):
    response = await mcp_ui_client.call_tool(
        tool_name="display_text_input",
        input={
            "prompt": prompt,
            "inputType": input_type,
            "placeholder": "Enter your input here..."
        }
    )
    return response.userInput
```

## Deployment

### Deploy to Cloudflare Workers

```bash
bun run deploy
```

Requires `wrangler` authentication:
```bash
wrangler login
```

## Integration with Voice Agent

The MCP UI server is called by the voice agent when it needs text input from the user:

```python
# In voice-agent/agno_client.py or voice agent main loop
async def handle_user_input_required(prompt: str):
    mcp_ui_url = os.getenv("MCP_UI_SERVER_URL")

    response = await fetch(
        f"{mcp_ui_url}/mcp/tools/call",
        method="POST",
        json={
            "toolName": "display_text_input",
            "input": {"prompt": prompt}
        }
    )

    user_input = response.json()
    return user_input
```

## Future Components

- [ ] Confirmation dialog UI
- [ ] Multi-select dropdown
- [ ] File upload form
- [ ] Date/time picker
- [ ] Credential input with password masking
- [ ] Code editor with syntax highlighting

## File Structure

```
mcp-ui-server/
├── src/
│   ├── index.ts              # Main server and routes
│   ├── types/
│   │   └── mcp.ts           # MCP type definitions
│   └── ui/
│       └── text-input.ts    # Text input UI component
├── wrangler.toml            # Cloudflare Workers config
├── tsconfig.json            # TypeScript config
├── package.json
└── README.md
```
