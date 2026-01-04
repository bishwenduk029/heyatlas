<div align="center">
  <h1>⚡ agent-smith</h1>
  <p>Multi-Agent Workflow System powered by <a href="https://voltagent.dev">VoltAgent</a></p>
  <p><em>Intelligent workflow orchestration for document processing, web research, and automation</em></p>
  
  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
  </p>
</div>

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- Git
- OpenAI API Key (optional - can configure later)
  - Get your key at: https://platform.openai.com/api-keys

### Installation

```bash
# Clone the repository (if not created via create-voltagent-app)
git clone <your-repo-url>
cd agent-smith

# Install Node.js dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Install Python MCP servers (for Office document support)
pip install office-powerpoint-mcp-server office-word-mcp-server

# Install Pandoc (for format conversion)
# macOS
brew install pandoc
# Ubuntu/Debian
sudo apt-get install pandoc
# Windows
choco install pandoc
```

📖 **See [SETUP.md](./SETUP.md) for detailed setup instructions and troubleshooting**

### Configuration

Edit `.env` file with your API keys:

```env
OPENAI_API_KEY=your-api-key-here

# VoltOps Platform (Optional)
# Get your keys at https://console.voltagent.dev/tracing-setup
# VOLTAGENT_PUBLIC_KEY=your-public-key
# VOLTAGENT_SECRET_KEY=your-secret-key
```

### Running the Application

```bash
# Development mode (with hot reload)
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start
```

## 🎯 Features

### Multi-Agent Workflow System

Agent Smith is a sophisticated multi-agent system that solves complex computational problems through intelligent agent coordination:

- **🎭 Workflow Orchestrator**: PlanAgent that analyzes tasks and delegates to specialized subagents
- **📄 Document Processing**: Convert PDFs, Word docs, Excel to Markdown or other formats
- **🌐 Web Research**: Automated browser-based research and data extraction
- **📊 Presentation Creation**: Generate PowerPoint presentations from content
- **📝 Document Writing**: Create formatted Word documents
- **🔄 Format Conversion**: Transform between various document formats using Pandoc

### Specialized Subagents

1. **Markdown Converter** - Microsoft MarkItDown MCP for document-to-Markdown conversion
2. **Browser Automation** - Vibium MCP for web automation (forms, navigation, research, data extraction)
3. **Presentation Creator** - PowerPoint generation and editing
4. **Document Writer** - Word document creation and formatting
5. **Format Converter** - Pandoc-based universal format conversion

### Example Workflows

- **PDF → PowerPoint**: Extract content and create presentations
- **Web Research → Document**: Research topics and generate reports
- **Form Automation**: Fill and submit web forms programmatically
- **Data Extraction → Report**: Scrape web data and generate documents
- **Multi-step Web Workflows**: Login, navigate, extract, document
- **Document Transformation**: Convert between formats intelligently

📖 **See [WORKFLOW_ARCHITECTURE.md](./WORKFLOW_ARCHITECTURE.md) for detailed architecture and workflow patterns**

### Core Features

- **AI-Powered Planning**: Automatic workflow planning with task decomposition
- **Memory & Context**: Built-in conversation history and context sharing
- **Type Safety**: Full TypeScript support
- **Extensible**: Easy to add new MCP servers and subagents
- **Production-Ready**: Docker support and comprehensive error handling

## 🔍 VoltOps Platform

### Local Development
The VoltOps Platform provides real-time observability for your agents during development:

1. **Start your agent**: Run `pnpm dev`
2. **Open console**: Visit [console.voltagent.dev](https://console.voltagent.dev)
3. **Auto-connect**: The console connects to your local agent at `http://localhost:3141`

Features:
- 🔍 Real-time execution visualization
- 🐛 Step-by-step debugging
- 📊 Performance insights
- 💾 No data leaves your machine

### Production Monitoring
For production environments, configure VoltOpsClient:

1. **Create a project**: Sign up at [console.voltagent.dev/tracing-setup](https://console.voltagent.dev/tracing-setup)
2. **Get your keys**: Copy your Public and Secret keys
3. **Add to .env**:
   ```env
   VOLTAGENT_PUBLIC_KEY=your-public-key
   VOLTAGENT_SECRET_KEY=your-secret-key
   ```
4. **Configure in code**: The template already includes VoltOpsClient setup!

## 📁 Project Structure

```
agent-smith/
├── src/
│   ├── index.ts          # Main agent configuration
│   ├── tools/            # Custom tools
│   │   ├── index.ts      # Tool exports
│   │   └── weather.ts    # Weather tool example
│   └── workflows/        # Workflow definitions
│       └── index.ts      # Expense approval workflow
├── dist/                 # Compiled output (after build)
├── .env                  # Environment variables
├── .voltagent/           # Agent memory storage
├── Dockerfile            # Production deployment
├── package.json
└── tsconfig.json
```

## 🧪 Example Workflows

### Workflow 1: PDF to PowerPoint
```
User: "Convert my research.pdf to a presentation"

System:
1. Delegates to markdown-converter: PDF → Markdown
2. Delegates to presentation-creator: Markdown → PowerPoint
3. Returns: professional_presentation.pptx
```

### Workflow 2: Web Research to Document
```
User: "Create a report about quantum computing"

System:
1. Delegates to browser-researcher: Research topic
2. Delegates to document-writer: Create formatted report
3. Returns: quantum_computing_report.docx
```

### Workflow 3: Complex Multi-Step
```
User: "Research AI trends and create a presentation"

System:
1. Delegates to browser-researcher: Research current AI trends
2. Analyzes and structures findings
3. Delegates to presentation-creator: Generate slide deck
4. Returns: ai_trends_2026.pptx with data-backed insights
```

📖 **See [WORKFLOW_ARCHITECTURE.md](./WORKFLOW_ARCHITECTURE.md) for more workflow patterns**

## 🐳 Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t agent-smith .

# Run container
docker run -p 3141:3141 --env-file .env agent-smith

# Or use docker-compose
docker-compose up
```

## 🛠️ Development

### Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Run production build
- `pnpm volt` - VoltAgent CLI tools

### Adding Custom Tools

Create new tools in `src/tools/`:

```typescript
import { createTool } from '@voltagent/core';
import { z } from 'zod';

export const myTool = createTool({
  name: 'myTool',
  description: 'Description of what this tool does',
  input: z.object({
    param: z.string(),
  }),
  output: z.string(),
  handler: async ({ param }) => {
    // Tool logic here
    return `Result: ${param}`;
  },
});
```

### Creating New Workflows

Add workflows in `src/workflows/`:

```typescript
import { createWorkflowChain } from '@voltagent/core';
import { z } from 'zod';

export const myWorkflow = createWorkflowChain({
  id: "my-workflow",
  name: "My Custom Workflow",
  purpose: "Description of what this workflow does",
  input: z.object({
    data: z.string(),
  }),
  result: z.object({
    output: z.string(),
  }),
})
  .andThen({
    id: "process-data",
    execute: async ({ data }) => {
      // Process the input
      const processed = data.toUpperCase();
      return { processed };
    },
  })
  .andThen({
    id: "final-step",
    execute: async ({ data }) => {
      // Final transformation
      return { output: `Result: ${data.processed}` };
    },
  });
```

## 📚 Resources

### Project Documentation
- **[WORKFLOW_ARCHITECTURE.md](./WORKFLOW_ARCHITECTURE.md)** - Complete architecture guide and workflow patterns
- **[SETUP.md](./SETUP.md)** - Detailed setup instructions and troubleshooting

### VoltAgent Resources
- **Documentation**: [voltagent.dev/docs](https://voltagent.dev/docs/)
- **Sub-agents Guide**: [voltagent.dev/docs/agents/sub-agents](https://voltagent.dev/docs/agents/sub-agents/)
- **PlanAgent Guide**: [voltagent.dev/docs/agents/plan-agent](https://voltagent.dev/docs/agents/plan-agent/)
- **Examples**: [github.com/VoltAgent/voltagent/tree/main/examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- **Discord**: [Join our community](https://s.voltagent.dev/discord)

### MCP Server Resources
- **MarkItDown**: [github.com/microsoft/markitdown](https://github.com/microsoft/markitdown)
- **Vibium**: [github.com/VibiumDev/vibium](https://github.com/VibiumDev/vibium)
- **PowerPoint MCP**: [github.com/GongRzhe/Office-PowerPoint-MCP-Server](https://github.com/GongRzhe/Office-PowerPoint-MCP-Server)
- **Word MCP**: [github.com/GongRzhe/Office-Word-MCP-Server](https://github.com/GongRzhe/Office-Word-MCP-Server)
- **Pandoc MCP**: [github.com/vivekVells/mcp-pandoc](https://github.com/vivekVells/mcp-pandoc)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
</div>