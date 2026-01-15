# Agent Smith (Python)

A multi-agent workforce built with [CAMEL-AI](https://camel-ai.org) for HeyAtlas.

## Features

- **Multi-Agent Orchestration**: CAMEL's `Workforce` coordinates specialized agents
- **Real-time Event Streaming**: Workforce events stream to Atlas UI via HTTP callbacks
- **Specialized Agents**:
  - 🌐 **Browser**: Web research, navigation, data extraction (Playwright)
  - 💻 **Terminal**: Shell commands, file operations
  - 🔍 **Research**: ArXiv papers, web search
  - 📊 **Excel**: Spreadsheet creation and analysis
  - 🎞️ **PowerPoint**: Presentation creation
  - 📝 **Document**: Word document creation

## Quick Start

```bash
# Install dependencies
uv sync

# Set API key (OpenRouter recommended)
export OPENROUTER_API_KEY=your-key

# Run server
python main.py

# Or run a single task
python main.py --task "Search for recent AI papers on arxiv"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/agents/agent-smith/text` | POST | Execute task |

### Execute Task

```bash
curl -X POST http://localhost:3141/agents/agent-smith/text \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a presentation about AI trends"}'
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key (recommended) |
| `HEYATLAS_PROVIDER_API_KEY` | HeyAtlas Gateway key |
| `ATLAS_CALLBACK_URL` | URL for streaming events to Atlas |
| `MODEL_NAME` | Override model (default: anthropic/claude-sonnet-4) |

## Architecture

```
src/
├── workforce.py      # Workforce configuration
├── config.py         # Model/API configuration
├── callbacks.py      # Event streaming to Atlas
├── prompts.py        # Agent system prompts
└── agents/
    ├── browser.py    # BrowserToolkit
    ├── terminal.py   # TerminalToolkit
    ├── research.py   # ArxivToolkit + SearchToolkit
    ├── docx.py       # FileWriteTool
    ├── xlsx.py       # ExcelToolkit
    ├── pptx.py       # PPTXToolkit
    └── planning.py   # Task decomposition
```

## CLI Usage

```bash
# Connect to HeyAtlas cloud
npx heyatlas connect agent-smith-py
```
