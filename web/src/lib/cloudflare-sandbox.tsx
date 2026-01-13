import { Cloud, type LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Custom icon component for Goose
export const GooseIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <image
      href="https://block.github.io/goose/img/logo_light.png"
      width="32"
      height="32"
    />
  </svg>
);

// Custom icon component for OpenCode
export const OpenCodeIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="32"
    height="40"
    viewBox="0 0 32 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g clipPath="url(#clip0_opencode)">
      <path d="M24 32H8V16H24V32Z" fill="#4B4646" />
      <path d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="currentColor" />
    </g>
    <defs>
      <clipPath id="clip0_opencode">
        <rect width="32" height="40" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

// Custom icon component for Claude Code
export const ClaudeCodeIcon: ComponentType<SVGProps<SVGSVGElement>> = (
  props,
) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
      fill="currentColor"
    />
  </svg>
);

export type AgentIcon = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

// API Key configuration for agents that require user credentials
export interface AgentApiKeyConfig {
  required: boolean;
  keyName: string;
  displayName: string;
  helpUrl?: string;
}

export interface RemoteAgent {
  id: string;
  name: string;
  icon: AgentIcon;
  comingSoon: boolean;
  description?: string;
  apiKey?: AgentApiKeyConfig;
}

export const REMOTE_AGENTS: RemoteAgent[] = [
  {
    id: "goose",
    name: "Goose",
    icon: GooseIcon,
    comingSoon: false,
    description: "Block's open-source AI coding agent",
    // Goose uses your LLM provider key (passed through Atlas)
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: OpenCodeIcon,
    comingSoon: false,
    description: "SST's AI coding assistant",
    // OpenCode uses your LLM provider key (passed through Atlas)
  },
  {
    id: "claude-code",
    name: "Claude Code",
    icon: ClaudeCodeIcon,
    comingSoon: true,
    description: "Anthropic's AI coding agent",
    apiKey: {
      required: true,
      keyName: "ANTHROPIC_API_KEY",
      displayName: "Anthropic API Key",
      helpUrl: "https://console.anthropic.com/",
    },
  },
  {
    id: "manus",
    name: "Manus",
    icon: Cloud,
    comingSoon: true,
    description: "General-purpose AI agent",
    apiKey: {
      required: true,
      keyName: "MANUS_API_KEY",
      displayName: "Manus API Key",
      helpUrl: "https://manus.im/",
    },
  },
  {
    id: "v0",
    name: "v0",
    icon: Cloud,
    comingSoon: true,
    description: "Vercel's AI UI generator",
    apiKey: {
      required: true,
      keyName: "V0_API_KEY",
      displayName: "v0 API Key",
      helpUrl: "https://v0.dev/",
    },
  },
  { id: "gemini-code", name: "Gemini Code", icon: Cloud, comingSoon: true },
  { id: "kimi", name: "Kimi", icon: Cloud, comingSoon: true },
  { id: "vibe", name: "Vibe", icon: Cloud, comingSoon: true },
  { id: "auggie", name: "Auggie", icon: Cloud, comingSoon: true },
  { id: "stakpak", name: "Stakpak", icon: Cloud, comingSoon: true },
  { id: "openhands", name: "OpenHands", icon: Cloud, comingSoon: true },
  { id: "cagent", name: "CAgent", icon: Cloud, comingSoon: true },
];

export type AgentId = (typeof REMOTE_AGENTS)[number]["id"];

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
