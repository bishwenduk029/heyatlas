/**
 * ACP AI Provider Agent
 *
 * Simplified agent implementation using @mcpc-tech/acp-ai-provider.
 * This replaces the complex ACPAgent class with AI SDK compatible streamText.
 */

import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { streamText } from "ai";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ACP commands for each agent
const ACP_COMMANDS: Record<string, { command: string; args: string[] }> = {
  opencode: { command: "opencode", args: ["acp"] },
  "claude-code": { command: "claude-code-acp", args: [] },
  goose: { command: "goose", args: ["acp"] },
  "gemini-code": { command: "gemini", args: ["--experimental-acp"] },
  codex: { command: "npx", args: ["@zed-industries/codex-acp"] },
  kimi: { command: "kimi", args: ["--acp"] },
  vibe: { command: "vibe-acp", args: [] },
  auggie: { command: "auggie", args: ["--acp"] },
  stakpak: { command: "stakpak", args: ["acp"] },
  openhands: { command: "openhands", args: ["acp"] },
  cagent: { command: "cagent", args: ["acp"] },
  copilot: { command: "copilot", args: ["--acp", "--port", "3000"] },
  smith: { command: "opencode", args: ["acp"] },
};

export type ACPAgentType = keyof typeof ACP_COMMANDS;

export function isACPAgent(agent: string): agent is ACPAgentType {
  return agent in ACP_COMMANDS;
}

export function getACPCommand(agent: ACPAgentType): string[] {
  const config = ACP_COMMANDS[agent];
  return config ? [config.command, ...config.args] : [];
}

// Smith workspace assets (embedded for bundling compatibility)
const SMITH_AGENTS: Record<string, string> = {
  "smith.md": `---
description: Intelligent workflow orchestrator that coordinates research, browser, and document subagents to solve complex multi-step tasks
mode: primary
model: heyatlas/huggingface/moonshotai/Kimi-K2.5:novita
tools:
  write: true
  edit: true
  bash: true
---

You are Smith, an intelligent workflow orchestrator and task planner coordinating a multi-agent team to solve complex tasks.

## Your Team

You coordinate the following specialized subagents — delegate to them via the Task tool:

- **@smith-researcher**: Web research specialist. Use for gathering information, searching the web, finding news, statistics, and deep research on any topic.
- **@smith-browser**: Browser automation expert. Use for navigating websites, filling forms, extracting data from pages, and interactive web workflows.
- **@smith-documents**: Document creation specialist. Use for creating Excel, PowerPoint, HTML files, converting documents, data visualization, and file operations.
- **@build**: Coding Specialist. Use for coding and building software apps.

## How You Work

1. **Analyze** the user's request and break it into discrete steps
2. **Plan** — create a 3-8 step plan, assigning each step to the right subagent
3. **Execute** — delegate tasks to subagents, running independent tasks in parallel
4. **Adapt** — if a step fails, reassign to smith-documents (has terminal access) or replan
5. **Summarize** — provide a clear summary of what was accomplished

## Workflow Patterns

- **Research → Document**: smith-researcher gathers info → smith-documents creates reports/presentations
- **Browser Tasks**: smith-browser navigates sites, fills forms, extracts data
- **Document Transform**: smith-documents reads source files → converts to target format
- **Data Analysis**: smith-researcher collects data → smith-documents creates visualizations
- **Hybrid**: smith-researcher + smith-browser gather info → smith-documents compiles output

## Rules

- Always create a plan before executing
- Update your plan as tasks progress
- Use absolute paths for all file operations — save outputs under /home/user/output/
- If you encounter auth barriers (logins, CAPTCHAs), ask the user to complete the manual step
- **MANDATORY**: After ALL file-producing tasks, you MUST upload outputs to R2 before summarizing. This is not optional.

## Output Upload (REQUIRED)

You MUST upload every output file to cloud storage. Tasks are not complete without this step.

\\\`\\\`\\\`bash
# Read task metadata
META=$(cat /home/user/agents/task-meta.json)
BUCKET=$(echo $META | jq -r '.bucket')
USER_ID=$(echo $META | jq -r '.userId')
TASK_ID=$(echo $META | jq -r '.taskId')
PUBLIC_URL=$(echo $META | jq -r '.publicUrl')

# Upload ALL output files
rclone copy /home/user/output/ r2:$BUCKET/$USER_ID/$TASK_ID/

# Report public URLs for each file
echo "File available at: $PUBLIC_URL/$USER_ID/$TASK_ID/<filename>"
\\\`\\\`\\\`

Your final summary MUST include the public URL for every uploaded file.`,

  "smith-browser.md": `---
description: Browser automation expert — navigates websites, fills forms, extracts data, and performs interactive web workflows
mode: subagent
model: heyatlas/huggingface/MiniMaxAI/MiniMax-M2.5:novita
tools:
  write: true
  edit: false
  bash: true
  smith-browser-use_*: true
  smith-chrome-devtools-use_*: true
  leann-server_*: false
  smith-code-search-toolkit_*: false
permission:
  bash:
    "*": allow
---

You are an expert Browser Agent specializing in web navigation, data extraction, and interactive web workflows.

## Capabilities

- Navigate websites and extract information
- Fill out and submit web forms
- Perform web searches via google.com
- Take screenshots to document findings
- Interact with web applications

## Workflow

1. Navigate to the target website or search engine
2. Interact with the page — click, fill forms, extract data
3. Save extracted data to files in the working directory
4. Document all URLs visited and actions taken

## Rules

- Always save important findings to files
- Document URLs visited in your response
- If you encounter CAPTCHAs or login requirements, report back and ask for human assistance
- Use absolute paths for all file operations
- Cite sources with URLs`,

  "smith-researcher.md": `---
description: Web research specialist — gathers information from the internet, performs deep research, finds news, statistics, and data on any topic
mode: subagent
model: heyatlas/huggingface/MiniMaxAI/MiniMax-M2.5:novita
tools:
  write: true
  edit: false
  bash: true
  smith-browser-use_*: false
  smith-chrome-devtools-use_*: false
  smith-websearch: true
---

You are a specialized Research Agent with powerful web search and information gathering capabilities.

## Capabilities

- Search the internet for current information, news, and data
- Perform deep multi-source research on complex topics
- Access academic papers and scholarly sources
- Extract and structure information from websites
- Save research findings to files

## Workflow

1. Understand what information is needed
2. Use available search and research tools to gather information
3. Verify across multiple sources when possible
4. Save findings to well-organized files in the working directory
5. Always cite sources with URLs

## Rules

- Save research findings to files — don't just return text
- Cite all sources with URLs
- Use the most recent sources available
- Structure findings with headings and bullet points
- For controversial topics, present multiple viewpoints
- If you hit paywalls, note them and try alternative sources`,

  "smith-documents.md": `---
description: Document creation specialist — creates Excel, PowerPoint, HTML files, converts documents, data visualization, and file operations
mode: subagent
model: heyatlas/huggingface/MiniMaxAI/MiniMax-M2.5:novita
tools:
  write: true
  edit: true
  bash: true
  smith-pptx: true
  smith-excel: true
  smith-docx: true
permission:
  bash:
    "*": allow
  smith-pptx:
    "*": allow
  smith-excel:
    "*": allow
  smith-docx:
    "*": allow
  write:
    "*": allow
---

You are a Documentation Specialist responsible for creating, modifying, and managing documents.

## Capabilities

- Create HTML, Markdown, CSV, JSON files, docx, pptx
- Use bash to run Python scripts for data visualization (plotly, matplotlib)
- Convert documents between formats
- Process and analyze text data with CLI tools (awk, sed, grep, jq)
- Create archives (tar, zip)
- Execute shell commands for file management

## Document Creation

- If no format is specified, create an HTML file
- For data-heavy documents, generate charts using Python and embed them
- Save ALL output files under /home/user/output/ (create directory if needed)
- When complete, provide the file path and a summary

## Rules

- Primary output should be files, not just text in response
- Use bash tools for data processing, visualization, and file operations
- For charts: write a Python script using plotly/matplotlib, execute it, save output as image
- **ALWAYS save files to /home/user/output/** — this is required for upload to work
- Provide a clear summary of work done and paths to created files`,
};

const SMITH_OPENCODE_JSONC = `{
  "$schema": "https://opencode.ai/config.json",
  "theme": "maple",
  "provider": {
    "heyatlas": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "HeyAtlas Provider",
      "options": {
        "baseURL": "\${HEYATLAS_PROVIDER_API_URL}",
        "apiKey": "\${HEYATLAS_PROVIDER_API_KEY}",
      },
      "models": {
        "huggingface/MiniMaxAI/MiniMax-M2.5:novita": {
          "name": "MiniMax-M2.5",
        },
        "huggingface/moonshotai/Kimi-K2.5:novita": {
          "name": "Kimi-K2.5",
        },
      },
    },
  },
  "mcp": {
    "smith-browser-use": {
      "type": "remote",
      "url": "http://127.0.0.1:12306/mcp",
      "enabled": true,
    },
    "smith-code-search-toolkit": {
      "type": "local",
      "command": ["uvx", "--from", "cased-kit", "kit-dev-mcp"],
      "enabled": true,
    },
    "smith-chrome-devtools-use": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"],
    },
    "smith-websearch": {
      "type": "remote",
      "url": "https://nirmanus-bifrost-gateway.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer e7381674-6495-4112-ab87-7b943eff2390",
      },
    },
    "smith-arxiv": {
      "type": "local",
      "command": [
        "uv",
        "run",
        "--python",
        "3.12",
        "--with",
        "camel-ai",
        "--with",
        "arxiv",
        "python",
        "-c",
        "from camel.toolkits import ArxivToolkit; ArxivToolkit().run_mcp_server(mode=\\"stdio\\")",
      ],
    },
    "smith-pptx": {
      "type": "local",
      "enabled": true,
      "command": [
        "uv",
        "run",
        "--python",
        "3.12",
        "--with",
        "camel-ai",
        "--with",
        "python-pptx",
        "python",
        "-c",
        "from camel.toolkits import PPTXToolkit; PPTXToolkit(working_directory=\\"\${WORKING_DIRECTORY}\\").run_mcp_server(mode=\\"stdio\\")",
      ],
    },
    "smith-docx": {
      "type": "local",
      "enabled": true,
      "command": [
        "uv",
        "run",
        "--python",
        "3.12",
        "--with",
        "camel-ai",
        "--with",
        "python-docx",
        "python",
        "-c",
        "from camel.toolkits import FileToolkit; FileToolkit(working_directory=\\"\${WORKING_DIRECTORY}\\").run_mcp_server(mode=\\"stdio\\")",
      ],
    },
    "smith-excel": {
      "type": "local",
      "enabled": true,
      "command": [
        "uv",
        "run",
        "--python",
        "3.12",
        "--with",
        "camel-ai",
        "--with",
        "openpyxl",
        "python",
        "-c",
        "from camel.toolkits import ExcelToolkit; ExcelToolkit(working_directory=\\"\${WORKING_DIRECTORY}\\").run_mcp_server(mode=\\"stdio\\")",
      ],
    },
  },
}`;

// Upload plugin for opencode — uses tool.execute.after to track files, uploads on session.idle
// Uses file-based logging (console.log pollutes ACP stdio protocol)
const SMITH_UPLOAD_PLUGIN = [
  'import { execSync } from "child_process";',
  'import { existsSync, readFileSync, writeFileSync } from "fs";',
  'import { basename, join } from "path";',
  '',
  'const UPLOAD_EXTS = new Set(["docx","xlsx","pptx","pdf","html","csv","png","jpg","jpeg","gif","svg","zip","md","txt"]);',
  'const FILE_PATH_RE = /(?:\\/[\\w.${},-]+)+\\.(?:docx|xlsx|pptx|pdf|html|csv|png|jpg|jpeg|gif|svg|zip|md|txt)\\b/gi;',
  '',
  'export const UploadPlugin = async ({ directory }) => {',
  '  const agentsDir = join(directory, "agents");',
  '  const metaPath = join(agentsDir, "task-meta.json");',
  '  const outputsPath = join(agentsDir, "outputs.json");',
  '  const trackedFiles = new Set();',
  '  return {',
  '    "tool.execute.after": async (input, output) => {',
  '      const result = typeof output === "string" ? output : JSON.stringify(output);',
  '      const matches = result.match(FILE_PATH_RE);',
  '      if (matches) { for (const fp of matches) { if (existsSync(fp)) trackedFiles.add(fp); } }',
  '    },',
  '    event: async ({ event }) => {',
  '      if (event.type === "file.edited" && event.properties?.file) {',
  '        const ext = event.properties.file.split(".").pop()?.toLowerCase();',
  '        if (ext && UPLOAD_EXTS.has(ext)) trackedFiles.add(event.properties.file);',
  '      }',
  '      if (event.type === "session.idle" && trackedFiles.size > 0) {',
  '        if (!existsSync(metaPath)) { trackedFiles.clear(); return; }',
  '        try {',
  '          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));',
  '          if (!meta.publicUrl || !meta.bucket) return;',
  '          const dest = "r2:" + meta.bucket + "/" + meta.userId + "/" + meta.taskId;',
  '          const base = meta.publicUrl.replace(/\\/$/, "");',
  '          const urls = [];',
  '          for (const fp of trackedFiles) {',
  '            if (!existsSync(fp)) continue;',
  '            const name = basename(fp);',
  '            try {',
  '              execSync("rclone copyto \\"" + fp + "\\" \\"" + dest + "/" + name + "\\"", { stdio: "pipe", timeout: 30000 });',
  '              urls.push({ url: base + "/" + meta.userId + "/" + meta.taskId + "/" + name, filename: name });',
  '            } catch {}',
  '          }',
  '          if (urls.length > 0) writeFileSync(outputsPath, JSON.stringify(urls));',
  '          trackedFiles.clear();',
  '        } catch {}',
  '      }',
  '    },',
  '  };',
  '};',
].join('\n');

async function setupSmithWorkspace(cwd: string): Promise<void> {
  // Create .opencode/agents/ and .opencode/plugins/ in workspace
  const targetAgentsDir = join(cwd, ".opencode", "agents");
  const targetPluginsDir = join(cwd, ".opencode", "plugins");
  mkdirSync(targetAgentsDir, { recursive: true });
  mkdirSync(targetPluginsDir, { recursive: true });

  // Write agent markdown files
  for (const [filename, content] of Object.entries(SMITH_AGENTS)) {
    writeFileSync(join(targetAgentsDir, filename), content);
  }

  // Write upload plugin
  writeFileSync(join(targetPluginsDir, "upload.js"), SMITH_UPLOAD_PLUGIN);

  // Write opencode.jsonc to workspace root, replacing ${WORKING_DIRECTORY} with actual cwd
  const config = SMITH_OPENCODE_JSONC.replace(/\$\{WORKING_DIRECTORY\}/g, cwd);
  writeFileSync(join(cwd, "opencode.jsonc"), config);

  console.log("[smith] Workspace configured with agents, plugins, and opencode.jsonc");
}

export interface ACPProviderAgentOptions {
  cwd?: string;
}

/**
 * ACPProviderAgent - Simplified agent using acp-ai-provider
 *
 * Provides AI SDK compatible streamText for any ACP agent.
 */
export class ACPProviderAgent {
  private agentType: ACPAgentType;
  private provider: ReturnType<typeof createACPProvider> | null = null;
  private options: ACPProviderAgentOptions;

  constructor(agentType: ACPAgentType, options: ACPProviderAgentOptions = {}) {
    if (!isACPAgent(agentType)) {
      throw new Error(`Unknown ACP agent: ${agentType}`);
    }
    this.agentType = agentType;
    this.options = options;
  }

  get name(): string {
    return this.agentType;
  }

  /**
   * Check if the agent executable is available
   */
  async isAvailable(): Promise<boolean> {
    const config = ACP_COMMANDS[this.agentType];
    if (!config) return false;

    const executable = config.command;

    // Special case for npx
    if (executable === "npx") {
      return true;
    }

    try {
      const { promisify } = await import("node:util");
      const exec = promisify((await import("node:child_process")).exec);
      await exec(`which ${executable}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the ACP provider
   */
  async init(): Promise<void> {
    const config = ACP_COMMANDS[this.agentType];
    if (!config) {
      throw new Error(`Unknown ACP agent: ${this.agentType}`);
    }

    // Smith needs workspace setup before running opencode
    if (this.agentType === "smith") {
      await setupSmithWorkspace(this.options.cwd || process.cwd());
    }

    this.provider = createACPProvider({
      command: config.command,
      args: config.args,
      session: {
        cwd: this.options.cwd || process.cwd(),
        mcpServers: [],
      },
      persistSession: true,
    });

    // Pre-initialize session for faster TTFT
    await this.provider.initSession();
  }

  /**
   * Stream a prompt to the agent
   * Returns AI SDK compatible StreamTextResult
   */
  stream(prompt: string) {
    if (!this.provider) {
      throw new Error("Provider not initialized. Call init() first.");
    }

    return streamText({
      model: this.provider.languageModel(),
      prompt,
      tools: this.provider.tools as Parameters<typeof streamText>[0]["tools"],
      includeRawChunks: true,
    });
  }

  /**
   * Clean up the provider
   */
  cleanup(): void {
    if (this.provider) {
      this.provider.cleanup();
      this.provider = null;
    }
  }
}
