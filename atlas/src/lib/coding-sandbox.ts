import { Sandbox } from "e2b";
import type { SelectedAgent } from "../types";

export interface SandboxConfig {
  timeoutMs?: number;
}

export interface CreateSandboxResult {
  sandboxId: string;
  sandbox: Sandbox;
}

const AGENT_TEMPLATES: Record<string, string> = {
  opencode: "heyatlas-opencode",
  goose: "heyatlas-goose",
};

/**
 * Create a new coding agent sandbox
 */
export async function createCodingSandbox(
  apiKey: string,
  agentId: string,
  config: SandboxConfig = {},
): Promise<CreateSandboxResult> {
  const template = AGENT_TEMPLATES[agentId];
  if (!template) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  const sandbox = await Sandbox.create(template, {
    apiKey,
    timeoutMs: config.timeoutMs ?? 3600 * 1000,
  });

  return { sandboxId: sandbox.sandboxId, sandbox };
}

/**
 * Connect a coding agent in an existing sandbox
 */
export async function connectAgentInSandbox(
  sandbox: Sandbox,
  agentId: string,
  envVars: Record<string, string>,
  credentials: { token: string; userId: string; email?: string },
): Promise<boolean> {
  try {
    console.log(
      `[CodingSandbox] Setting env vars for agent ${agentId}:`,
      Object.keys(envVars),
    );

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
      `[CodingSandbox] Writing credentials file for user ${credentials.userId}`,
    );
    await sandbox.commands.run("mkdir -p /root/.heyatlas /root/.config");
    await sandbox.files.write("/root/.heyatlas/credentials.json", credentialsJson);

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
        `[CodingSandbox] Writing OpenCode config to /root/.config/opencode/opencode.jsonc`,
      );
      await sandbox.commands.run("mkdir -p /root/.config/opencode");
      await sandbox.files.write(
        "/root/.config/opencode/opencode.jsonc",
        JSON.stringify(opencodeConfig, null, 2),
      );
    }

    const command = `heyatlas connect ${agentId}`;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[CodingSandbox] Starting process (attempt ${attempt}/${maxRetries}): ${command}`);

      const process = await sandbox.commands.run(command, {
        background: true,
        envs: {
          ...envVars,
          HEYATLAS_CODING_AGENT: agentId,
        },
        onStdout: (data) => console.log(`[CodingSandbox stdout] ${data}`),
        onStderr: (data) => console.log(`[CodingSandbox stderr] ${data}`),
      });

      console.log(
        `[CodingSandbox] Process started: pid=${process.pid}, exitCode=${process.exitCode}`,
      );

      // Wait for process to initialize
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check if process is still running (exitCode null = running)
      if (process.exitCode === null) {
        console.log(`[CodingSandbox] Agent connected successfully on attempt ${attempt}`);
        return true;
      }

      console.log(`[CodingSandbox] Process exited with code ${process.exitCode}, attempt ${attempt}/${maxRetries}`);
      
      if (attempt < maxRetries) {
        console.log(`[CodingSandbox] Retrying in 2 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.error(`[CodingSandbox] Failed to connect agent after ${maxRetries} attempts`);
    return false;
  } catch (error) {
    console.error("[CodingSandbox] Failed to connect agent:", error);
    return false;
  }
}

/**
 * Reconnect to an existing sandbox
 */
export async function connectToSandbox(
  apiKey: string,
  sandboxId: string,
): Promise<Sandbox | null> {
  try {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey });
    return sandbox;
  } catch (error) {
    console.error("[CodingSandbox] Failed to connect to sandbox:", error);
    return null;
  }
}

/**
 * Destroy a sandbox instance
 */
export async function destroySandbox(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.kill();
  } catch (error) {
    console.error("[CodingSandbox] Failed to destroy sandbox:", error);
  }
}

/**
 * Get public URL for a port in the sandbox
 * E2B sandboxes have public URLs in format: https://{port}-{sandboxId}.e2b.dev
 */
export function getSandboxPublicUrl(sandbox: Sandbox, port: number): string {
  return `https://${sandbox.getHost(port)}`;
}

/**
 * Get the host URL for a port in the sandbox
 */
export function getSandboxHost(sandbox: Sandbox, port: number): string {
  return sandbox.getHost(port);
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
  { id: "opencode", name: "OpenCode", comingSoon: false },
  { id: "goose", name: "Goose", comingSoon: true },
  { id: "claude", name: "Claude Code", comingSoon: true },
  { id: "codex", name: "Claude Code", comingSoon: true },
  { id: "gemini-code", name: "Gemini Code", comingSoon: true },
  { id: "kimi", name: "Kimi", comingSoon: true },
  { id: "vibe", name: "Vibe", comingSoon: true },
  { id: "auggie", name: "Auggie", comingSoon: true },
  { id: "stakpak", name: "Stakpak", comingSoon: true },
  { id: "openhands", name: "OpenHands", comingSoon: true },
  { id: "cagent", name: "CAgent", comingSoon: true },
] as const;

export type AgentId = (typeof REMOTE_AGENTS)[number]["id"];

// Re-export Sandbox type for consumers
export type { Sandbox };
