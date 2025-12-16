import yaml from "js-yaml";

export interface UnifiedMcpConfig {
  mcp?: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
  mcpServers?: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}

export function generateGooseConfig(config: UnifiedMcpConfig): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions: Record<string, any> = {};

  const servers = config.mcp || config.mcpServers;

  if (servers) {
    for (const [key, server] of Object.entries(servers)) {
      extensions[key] = {
        name: key,
        type: "stdio",
        cmd: server.command,
        args: server.args || [],
        env_keys: Object.keys(server.env || {}),
        envs: server.env || {},
        enabled: true,
        timeout: 500, // Default timeout
      };
    }
  }

  // Add default Goose provider settings
  const gooseConfig = {
    extensions,
    GOOSE_PROVIDER: "litellm",
    GOOSE_MODEL: "openrouter/z-ai/glm-4.6",
  };

  return yaml.dump(gooseConfig);
}

export function generateOpenCodeConfig(config: UnifiedMcpConfig): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcp: Record<string, any> = {};

  const servers = config.mcp || config.mcpServers;

  if (servers) {
    for (const [key, server] of Object.entries(servers)) {
      mcp[key] = {
        type: "local",
        command: [server.command, ...(server.args || [])],
        enabled: true,
        environment: server.env || {},
      };
    }
  }

  const openCodeConfig = {
    $schema: "https://opencode.ai/config.json",
    mcp,
    provider: {
      heyatlas: {
        npm: "@ai-sdk/openai-compatible",
        name: "HeyAtlas",
        options: {
          baseURL: "${BIFROST_URL}/litellm",
          apiKey: "{env:LITELLM_API_KEY}",
        },
        models: {
          "openrouter/z-ai/glm-4.6": {
            name: "GLM-4.6",
          },
        },
      },
    },
  };

  return JSON.stringify(openCodeConfig, null, 4);
}
