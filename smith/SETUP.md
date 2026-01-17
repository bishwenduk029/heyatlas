# Setup Guide for Multi-Agent Workflow System

This guide walks through setting up all MCP servers required for the multi-agent workflow system.

## Prerequisites

- **Node.js** v20.19.0 or higher
- **pnpm** (package manager - install via `npm install -g pnpm` or `brew install pnpm`)
- **Python** 3.8 or higher (for Office MCP servers)
- **pip** (Python package installer)

## Installation Steps

### 1. Core Application Setup

```bash
# Install Node.js dependencies
pnpm install
```

### 2. MCP Servers Installation

The system uses several MCP servers. Most are auto-installed via `npx -y`, but Python-based servers require manual setup.

#### A. Microsoft MarkItDown MCP (Auto-installed)
Converts PDF, Word, Excel, images, audio to Markdown.

**No manual installation needed** - uses `npx -y @microsoft/markitdown-mcp`

**Verification:**
```bash
npx @microsoft/markitdown-mcp --help
```

#### B. Vibium Browser Automation (Auto-installed)
AI-native browser automation with built-in MCP server for form filling, navigation, and data extraction.

**No manual installation needed** - uses `npx -y vibium`

**First-time setup (automatic):**
Vibium automatically downloads Chrome for Testing on first use. No manual browser setup required.

**Verification:**
```bash
npx vibium --help
```

#### C. Office PowerPoint MCP Server (Manual Python Setup)
Creates and edits PowerPoint presentations.

**Installation:**
```bash
# Install from PyPI
pip install office-powerpoint-mcp-server

# Or install from source
pip install git+https://github.com/GongRzhe/Office-PowerPoint-MCP-Server.git
```

**Verification:**
```bash
python -m office_powerpoint_mcp_server --version
```

**Dependencies:**
- `python-pptx` - PowerPoint manipulation library
- `mcp` - Model Context Protocol Python SDK

#### D. Office Word MCP Server (Manual Python Setup)
Creates and edits Word documents.

**Installation:**
```bash
# Install from PyPI
pip install office-word-mcp-server

# Or install from source
pip install git+https://github.com/GongRzhe/Office-Word-MCP-Server.git
```

**Verification:**
```bash
python -m office_word_mcp_server --version
```

**Dependencies:**
- `python-docx` - Word document manipulation library
- `mcp` - Model Context Protocol Python SDK

#### E. Pandoc MCP (Auto-installed)
Generic document format conversion.

**No manual installation needed** - uses `npx -y mcp-pandoc`

**Note:** Requires Pandoc to be installed on your system:
```bash
# macOS
brew install pandoc

# Ubuntu/Debian
sudo apt-get install pandoc

# Windows (using Chocolatey)
choco install pandoc

# Or download from https://pandoc.org/installing.html
```

**Verification:**
```bash
pandoc --version
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```bash
# HeyAtlas AI Gateway Configuration
HEYATLAS_PROVIDER_API_KEY=your_api_key_here
HEYATLAS_PROVIDER_API_URL=your_provider_url_here

# Atlas Callback Configuration (for task updates)
SANDBOX_CALLBACK_TOKEN=your_callback_token
SANDBOX_USER_ID=your_user_id
ATLAS_CALLBACK_URL=your_atlas_url
```

## Testing the Setup

### Quick Test

Run the development server:
```bash
pnpm dev
```

The server should start without errors and load all MCP servers.

### Individual MCP Server Tests

#### Test MarkItDown:
```bash
# Create a test file and try conversion
echo "# Test" > test.md
npx @microsoft/markitdown-mcp convert test.md
```

#### Test Browser Automation:
```bash
# Vibium should be accessible
npx vibium --help
```

#### Test PowerPoint MCP:
```bash
# Should show available commands
python -m office_powerpoint_mcp_server --help
```

#### Test Word MCP:
```bash
# Should show available commands
python -m office_word_mcp_server --help
```

#### Test Pandoc:
```bash
# Should show Pandoc version
pandoc --version
```

## Troubleshooting

### Python MCP Servers Not Found

**Problem:** `python -m office_powerpoint_mcp_server` fails

**Solutions:**
1. Verify Python is in PATH:
   ```bash
   python --version
   which python
   ```

2. Check if package is installed:
   ```bash
   pip list | grep office-powerpoint-mcp-server
   ```

3. Use absolute Python path if needed:
   ```bash
   /usr/local/bin/python3 -m office_powerpoint_mcp_server
   ```

4. Update MCP config in `src/index.ts` to use correct Python path:
   ```typescript
   powerpoint: {
     type: 'stdio',
     command: '/usr/local/bin/python3',  // Update path
     args: ['-m', 'office_powerpoint_mcp_server'],
     timeout: 60000,
   }
   ```

### Pandoc Not Found

**Problem:** Pandoc MCP works but conversions fail

**Solution:** Install Pandoc system package:
```bash
# macOS
brew install pandoc

# Linux
sudo apt-get install pandoc

# Verify
pandoc --version
```

### Vibium Browser Not Found

**Problem:** Browser automation fails with "Browser not found"

**Solution:** Vibium automatically downloads Chrome for Testing on first use. If issues persist:
```bash
# Manually trigger browser download
npx vibium
# Follow the automatic download prompts
```

**Note:** Vibium manages its own Chrome installation and doesn't require manual browser setup.

### MCP Server Timeout

**Problem:** MCP server initialization times out

**Solutions:**
1. Increase timeout in `src/index.ts`:
   ```typescript
   markitdown: {
     type: 'stdio',
     command: 'npx',
     args: ['-y', '@microsoft/markitdown-mcp'],
     timeout: 120000,  // Increase from 60000
   }
   ```

2. Pre-install packages globally to avoid download time:
   ```bash
   pnpm add -g @microsoft/markitdown-mcp
   pnpm add -g vibium
   pnpm add -g mcp-pandoc
   ```

### Permission Errors

**Problem:** Permission denied when running Python MCP servers

**Solution:** Use virtual environment or user install:
```bash
# User install
pip install --user office-powerpoint-mcp-server office-word-mcp-server

# Or use virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install office-powerpoint-mcp-server office-word-mcp-server
```

## Optional Dependencies

### For Enhanced OCR (MarkItDown)
```bash
pip install pytesseract
brew install tesseract  # macOS
# or
sudo apt-get install tesseract-ocr  # Linux
```

### For Audio Transcription (MarkItDown)
```bash
pip install openai-whisper
# Note: Requires ffmpeg
brew install ffmpeg  # macOS
```

## Verifying Complete Setup

Run this command to check all components:

```bash
# Check Node.js
node --version

# Check Python
python --version

# Check pip packages
pip list | grep -E "office-powerpoint|office-word"

# Check system tools
pandoc --version
npx vibium --help

# Start the application
pnpm dev
```

If all checks pass and the server starts successfully, your setup is complete!

## Production Deployment

For production deployment, consider:

1. **Pre-install all dependencies** in Docker image or deployment environment
2. **Use specific versions** instead of `@latest` for stability
3. **Set appropriate timeouts** based on your infrastructure
4. **Monitor MCP server health** and restart on failures
5. **Use environment-specific Python paths** in configuration

Example production Docker setup:
```dockerfile
FROM node:20-alpine

# Install Python and system dependencies
RUN apk add --no-cache python3 py3-pip pandoc

# Install Python MCP servers
RUN pip3 install office-powerpoint-mcp-server office-word-mcp-server

# Install pnpm
RUN npm install -g pnpm

# Install Node.js dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Vibium will auto-download Chrome on first use
# No manual browser installation needed

# Copy application code
COPY . .

# Start application
CMD ["npm", "start"]
```

## Next Steps

After setup is complete:

1. Read [WORKFLOW_ARCHITECTURE.md](./WORKFLOW_ARCHITECTURE.md) to understand the system
2. Try example workflows from the documentation
3. Customize subagent prompts for your use cases
4. Add additional MCP servers as needed

## Support

For issues with specific MCP servers:
- **MarkItDown:** https://github.com/microsoft/markitdown
- **Vibium:** https://github.com/VibiumDev/vibium
- **PowerPoint MCP:** https://github.com/GongRzhe/Office-PowerPoint-MCP-Server
- **Word MCP:** https://github.com/GongRzhe/Office-Word-MCP-Server
- **Pandoc MCP:** https://github.com/vivekVells/mcp-pandoc

For VoltAgent framework questions:
- **Documentation:** https://voltagent.dev/docs
- **GitHub:** https://github.com/VoltAgent/voltagent
