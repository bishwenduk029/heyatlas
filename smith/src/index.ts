import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { NodeFilesystemBackend, PlanAgent, VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import { mcpConfig } from "./config";
import {
	DOCUMENT_AGENT_PROMPT,
	ORCHESTRATOR_PROMPT,
	PLANNING_PROMPT,
	RESEARCH_AGENT_PROMPT,
	WEB_AND_BROWSER_PROMPT,
} from "./prompts";

const providerApiKey = process.env.HEYATLAS_PROVIDER_API_KEY;
if (!providerApiKey) {
	throw new Error("Missing env var: HEYATLAS_PROVIDER_API_KEY");
}

const providerAPI = process.env.HEYATLAS_PROVIDER_API_URL;
if (!providerAPI) {
	throw new Error("Missing env var: HEYATLAS_PROVIDER_API_URL");
}

const heyatlasProvider = createOpenAICompatible({
	name: "heyatlas-ai-gateway",
	apiKey: providerApiKey,
	baseURL: providerAPI,
	includeUsage: false,
});

const logger = createPinoLogger({
	name: "agent-smith",
	level: "debug",
});

(async () => {
	const toolsets = await mcpConfig.getToolsets();

	const workflowAgent = new PlanAgent({
		name: "workflow-orchestrator",
		systemPrompt: ORCHESTRATOR_PROMPT,
		model: heyatlasProvider("cerebras/zai-glm-4.7"),
		filesystem: {
			backend: new NodeFilesystemBackend({
				rootDir: process.cwd(),
				virtualMode: false,
			}),
		},
		subagents: [
			{
				name: "browser-agent",
				purpose:
					"Expert in web navigation, search and data extraction. Capable of visiting websites, filling forms, and submitting them. Has file and terminal access.",
				systemPrompt: WEB_AND_BROWSER_PROMPT,
				model: heyatlasProvider("cerebras/zai-glm-4.7"),
				tools: [
					...(toolsets.browser?.getTools() || []),
					...(toolsets.arxiv?.getTools() || []),
					...(toolsets.file?.getTools() || []),
					...(toolsets.terminal?.getTools() || []),
				],
			},
			{
				name: "web-research-agent",
				purpose:
					"Specialized research agent with powerful web search capabilities. Gathers comprehensive information from the internet, performs deep research, searches academic sources, and extracts structured data. Ideal for gathering facts, statistics, news, and detailed research on any topic.",
				systemPrompt: RESEARCH_AGENT_PROMPT,
				model: heyatlasProvider("cerebras/zai-glm-4.7"),
				tools: [
					...(toolsets.websearch?.getTools() || []),
					...(toolsets.file?.getTools() || []),
					...(toolsets.terminal?.getTools() || []),
				],
			},
			{
				name: "document-agent",
				purpose:
					"Document processing specialist for creating Excel (.xlsx), PowerPoint (.pptx), HTML files, and converting documents to Markdown. Has file and terminal access.",
				systemPrompt: DOCUMENT_AGENT_PROMPT,
				model: heyatlasProvider("cerebras/zai-glm-4.7"),
				tools: [
					...(toolsets.pptx?.getTools() || []),
					...(toolsets.excel?.getTools() || []),
					...(toolsets.markitdown?.getTools() || []),
					...(toolsets.file?.getTools() || []),
					...(toolsets.terminal?.getTools() || []),
				],
			},
		],
		planning: {
			systemPrompt: PLANNING_PROMPT,
		},
		summarization: {
			triggerTokens: 150_000,
			keepMessages: 10,
		},
	});

	new VoltAgent({
		agents: {
			"workflow-orchestrator": workflowAgent,
		},
		server: honoServer(),
		logger,
	});
})();
