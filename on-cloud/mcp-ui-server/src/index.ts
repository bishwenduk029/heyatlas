import { Hono } from "hono";
import { cors } from "hono/cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { createUIResource } from "@mcp-ui/server";
import { z } from "zod";
import { textInputUI } from "./ui/text-input";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Enable CORS - allow auth headers and MCP protocol headers
app.use(
  "*",
  cors({
    origin: "*",
    exposeHeaders: ["Mcp-Session-Id"],
    allowHeaders: [
      "Content-Type",
      "Accept",
      "mcp-session-id",
      "NIRMANUS_API_KEY",
      "X-User-ID",
    ],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  }),
);

// Create MCP server
const mcpServer = new McpServer({
  name: "heycomputer-mcp-ui-server",
  version: "1.0.0",
});

// Create transport
const transport = new StreamableHTTPTransport();

// Register display_text_input tool using Zod schema
mcpServer.tool(
  "display_text_input",
  "Display a text input form to the user for collecting input like URLs, phone numbers, names, etc.",
  {
    prompt: z.string().describe("The prompt/label to display to the user"),
    placeholder: z
      .string()
      .optional()
      .describe("Placeholder text for the input field"),
    inputType: z
      .enum(["text", "email", "tel", "url", "password"])
      .optional()
      .describe("HTML input type"),
    multiline: z
      .boolean()
      .optional()
      .describe("Whether to use a textarea for multi-line input"),
    maxLength: z.number().optional().describe("Maximum character length"),
  },
  async ({ prompt, placeholder, inputType, multiline, maxLength }) => {
    console.log("[MCP] display_text_input called with:", {
      prompt,
      placeholder,
      inputType,
      multiline,
      maxLength,
    });

    // Generate the form HTML
    const formHTML = textInputUI.renderHTML({
      prompt,
      placeholder: placeholder || "",
      inputType: inputType || "text",
      multiline: multiline || false,
      maxLength: maxLength || 1000,
    });

    // Create the UI resource using MCP-UI server SDK
    const uiResource = createUIResource({
      uri: "ui://text-input",
      content: {
        type: "rawHtml",
        htmlString: formHTML,
      },
      encoding: "text",
    });

    return {
      content: [uiResource],
    };
  },
);

// Authentication middleware
const authMiddleware = async (c: any, next: any) => {
  const nirmanusApiKey = c.req.header("NIRMANUS_API_KEY");
  const userId = c.req.header("X-User-ID");

  // Check if headers are present
  if (!nirmanusApiKey || !userId) {
    console.warn("[Auth] Rejected request - missing headers:", {
      hasApiKey: !!nirmanusApiKey,
      hasUserId: !!userId,
    });
    return c.json(
      {
        error: "Unauthorized",
        message: "Missing required authentication headers: NIRMANUS_API_KEY and X-User-ID",
      },
      403
    );
  }

  // Validate API key against environment variable
  const validApiKey = c.env?.NIRMANUS_API_KEY || process.env.NIRMANUS_API_KEY;
  if (validApiKey && nirmanusApiKey !== validApiKey) {
    console.warn("[Auth] Rejected request - invalid API key:", {
      userId,
      providedKey: nirmanusApiKey.substring(0, 8) + "...",
    });
    return c.json(
      {
        error: "Unauthorized",
        message: "Invalid API key",
      },
      403
    );
  }

  console.log("[Auth] Request authenticated:", { userId });
  await next();
};

// Health check endpoint - no auth required
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// UI endpoint - no auth required for testing/preview
app.get("/ui/text-input", (c) => {
  return c.html(textInputUI.renderHTML());
});

// MCP endpoint - requires authentication
app.all("/mcp", authMiddleware, async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
    console.log("[MCP] Server connected to transport");
  }
  return transport.handleRequest(c);
});

// Export for Cloudflare Workers and local development
export default app;

interface CloudflareBindings {
  VOICE_AGENT_URL?: string;
  ENVIRONMENT?: string;
}
