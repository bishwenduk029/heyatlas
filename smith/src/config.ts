import { MCPConfiguration } from "@voltagent/core";

const WORKING_DIRECTORY = process.cwd();
const BIFROST_API_KEY = process.env.BIFROST_API_KEY;

export const mcpConfig = new MCPConfiguration({
	servers: {
		browser: {
			type: "stdio",
			command: "npx",
			args: ["-y", "@playwright/mcp@latest"],
			timeout: 60000,
		},
		excel: {
			type: "stdio",
			command: "uv",
			args: [
				"run",
				"--python",
				"3.12",
				"--with",
				"camel-ai",
				"--with",
				"openpyxl",
				"python",
				"-c",
				`from camel.toolkits import ExcelToolkit; ExcelToolkit(working_directory="${WORKING_DIRECTORY}").run_mcp_server(mode="stdio")`,
			],
			timeout: 60000,
		},
		pptx: {
			type: "stdio",
			command: "uv",
			args: [
				"run",
				"--python",
				"3.12",
				"--with",
				"camel-ai",
				"--with",
				"python-pptx",
				"python",
				"-c",
				`from camel.toolkits import PPTXToolkit; PPTXToolkit(working_directory="${WORKING_DIRECTORY}").run_mcp_server(mode="stdio")`,
			],
			timeout: 60000,
		},
		markitdown: {
			type: "stdio",
			command: "uvx",
			args: ["markitdown-mcp"],
			timeout: 30000,
		},
		arxiv: {
			type: "stdio",
			command: "uv",
			args: [
				"run",
				"--python",
				"3.12",
				"--with",
				"camel-ai",
				"--with",
				"arxiv",
				"python",
				"-c",
				'from camel.toolkits import ArxivToolkit; ArxivToolkit().run_mcp_server(mode="stdio")',
			],
			timeout: 60000,
		},
		file: {
			type: "stdio",
			command: "uv",
			args: [
				"run",
				"--python",
				"3.12",
				"--with",
				"camel-ai",
				"--with",
				"python-docx",
				"python",
				"-c",
				`from camel.toolkits import FileToolkit; FileToolkit(working_directory="${WORKING_DIRECTORY}").run_mcp_server(mode="stdio")`,
			],
			timeout: 60000,
		},
		terminal: {
			type: "stdio",
			command: "uv",
			args: [
				"run",
				"--python",
				"3.12",
				"--with",
				"camel-ai",
				"python",
				"-c",
				`from camel.toolkits import TerminalToolkit; TerminalToolkit(working_directory="${WORKING_DIRECTORY}", safe_mode=True).run_mcp_server(mode="stdio")`,
			],
			timeout: 60000,
		},
		websearch: {
			type: "streamable-http",
			url: "https://nirmanus-bifrost-gateway.fly.dev/mcp",
			timeout: 60000,
			requestInit: {
				headers: {
					"Authorization": "Bearer e7381674-6495-4112-ab87-7b943eff2390",
				},
			},
		},
	},
});
