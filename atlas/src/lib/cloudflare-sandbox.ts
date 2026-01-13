import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import type { SelectedAgent } from "../types";

export interface CloudflareSandboxConfig {
  idleTimeout?: number;
}

export interface CreateSandboxResult {
  sandboxId: string;
  sessionId: string;
}

/**
 * Create a new Cloudflare Sandbox instance
 * Uses the official @cloudflare/sandbox SDK with Durable Object namespace
 */
export async function createCloudflareSandbox(
  sandboxNamespace: DurableObjectNamespace<Sandbox>,
  config: CloudflareSandboxConfig = {},
): Promise<CreateSandboxResult> {
  // Generate unique sandbox ID
  const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Get sandbox instance using official SDK
  const sandbox = getSandbox(sandboxNamespace, sandboxId);

  // Set sandbox name for identification
  await sandbox.setSandboxName(sandboxId);

  // Create a session for the sandbox
  const sessionId = "default";

  return { sandboxId, sessionId };
}

/**
 * Connect a coding agent in an existing sandbox
 */
export async function connectAgentInSandbox(
  sandboxNamespace: DurableObjectNamespace<Sandbox>,
  sandboxId: string,
  _sessionId: string, // Not used in new SDK, kept for API compatibility
  agentId: string,
  envVars: Record<string, string>,
  credentials: { token: string; userId: string; email?: string },
): Promise<boolean> {
  try {
    const sandbox = getSandbox(sandboxNamespace, sandboxId);

    // Set environment variables
    console.log(
      `[CloudflareSandbox] Setting env vars for agent ${agentId}:`,
      Object.keys(envVars),
    );
    await sandbox.setEnvVars({
      ...envVars,
      HEYATLAS_CODING_AGENT: agentId,
    });

    // Write credentials file so CLI can authenticate
    const credentialsJson = JSON.stringify(
      {
        accessToken: credentials.token,
        userId: credentials.userId,
        email: credentials.email || "sandbox@heyatlas.app",
      },
      null,
      2,
    );

    console.log(
      `[CloudflareSandbox] Writing credentials file for user ${credentials.userId}`,
    );
    await sandbox.exec("mkdir -p /root/.heyatlas /root/.config");
    await sandbox.writeFile(
      "/root/.heyatlas/credentials.json",
      credentialsJson,
    );

    // Write OpenCode configuration if this is an opencode agent
    if (agentId === "opencode") {
      const modelKey = "zai-org/GLM-4.7";
      const opencodeConfig = {
        $schema: "https://opencode.ai/config.json",
        provider: {
          heyatlas: {
            npm: "@ai-sdk/openai-compatible",
            name: "HeyAtlas Provider",
            options: {
              baseURL: envVars.HEYATLAS_PROVIDER_API_URL,
              apiKey: envVars.HEYATLAS_PROVIDER_API_KEY,
            },
            models: {
              [modelKey]: {
                name: "Baseten",
              },
            },
          },
        },
      };
      console.log(
        `[CloudflareSandbox] Writing OpenCode config to /root/.config/opencode/opencode.jsonc`,
      );
      await sandbox.exec("mkdir -p /root/.config/opencode");
      await sandbox.writeFile(
        "/root/.config/opencode/opencode.jsonc",
        JSON.stringify(opencodeConfig, null, 2),
      );
    }

    // Start the agent as a background process (using installed binary directly to save memory)
    const command = `heyatlas connect ${agentId}`;
    console.log(`[CloudflareSandbox] Starting process: ${command}`);
    const process = await sandbox.startProcess(command);

    console.log(
      `[CloudflareSandbox] Process started: id=${process.id}, status=${process.status}`,
    );

    // Stream logs for debugging (non-blocking)
    streamProcessLogs(sandbox, process.id).catch((err) => {
      console.error(`[CloudflareSandbox] Log streaming error:`, err);
    });

    return !!process;
  } catch (error) {
    console.error("[CloudflareSandbox] Failed to connect agent:", error);
    return false;
  }
}

/**
 * Stream process logs to console for debugging
 */
async function streamProcessLogs(
  sandbox: ReturnType<typeof getSandbox>,
  processId: string,
) {
  try {
    // Try to get logs after a short delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const logs = await sandbox.getProcessLogs(processId);
    if (logs) {
      console.log(`[CloudflareSandbox] Process ${processId} logs:`);
      if (logs.stdout) console.log(`  [stdout] ${logs.stdout}`);
      if (logs.stderr) console.log(`  [stderr] ${logs.stderr}`);
    }
  } catch (err) {
    // Logs might not be available yet
    console.log(
      `[CloudflareSandbox] Could not get logs for ${processId}:`,
      err,
    );
  }
}

/**
 * Destroy a sandbox instance
 */
export async function destroyCloudflareSandbox(
  sandboxNamespace: DurableObjectNamespace<Sandbox>,
  sandboxId: string,
): Promise<void> {
  try {
    const sandbox = getSandbox(sandboxNamespace, sandboxId);
    await sandbox.destroy();
  } catch (error) {
    console.error("[CloudflareSandbox] Failed to destroy sandbox:", error);
  }
}

/**
 * Expose a port from the sandbox and return the exposed URL
 */
export async function exposeSandboxPort(
  sandboxNamespace: DurableObjectNamespace<Sandbox>,
  sandboxId: string,
  port: number,
  hostname: string,
): Promise<{ url: string } | null> {
  try {
    const sandbox = getSandbox(sandboxNamespace, sandboxId);
    const service = await sandbox.exposePort(port, { hostname });
    console.log(`[CloudflareSandbox] Exposed port ${port}: ${service.url}`);
    return { url: service.url };
  } catch (error) {
    console.error("[CloudflareSandbox] Failed to expose port:", error);
    return null;
  }
}

export function isRemoteAgent(agent: SelectedAgent): boolean {
  return agent.type === "cloud";
}

export function getAgentDisplayName(agentId: string): string {
  const agentNames: Record<string, string> = {
    goose: "Goose",
    opencode: "OpenCode",
    claude: "Claude Code",
    codex: "Claude Code",
    "claude-code": "Claude Code",
    "gemini-code": "Gemini Code",
  };
  return agentNames[agentId.toLowerCase()] || agentId;
}

export const REMOTE_AGENTS = [
  { id: "goose", name: "Goose", comingSoon: false },
  { id: "opencode", name: "OpenCode", comingSoon: false },
  { id: "claude", name: "Claude Code", comingSoon: false },
  { id: "codex", name: "Claude Code", comingSoon: false },
  { id: "gemini-code", name: "Gemini Code", comingSoon: true },
  { id: "kimi", name: "Kimi", comingSoon: true },
  { id: "vibe", name: "Vibe", comingSoon: true },
  { id: "auggie", name: "Auggie", comingSoon: true },
  { id: "stakpak", name: "Stakpak", comingSoon: true },
  { id: "openhands", name: "OpenHands", comingSoon: true },
  { id: "cagent", name: "CAgent", comingSoon: true },
] as const;

export type AgentId = (typeof REMOTE_AGENTS)[number]["id"];
