/**
 * heyatlas CLI - Tunnel local AI agents to the cloud via ACP
 */

import { parseArgs } from "util";
import { connect } from "./commands/connect";
import type { AgentType } from "./agents";

// ACP-compatible agents
const SUPPORTED_AGENTS = [
  "opencode",
  "claude",
  "goose",
  "gemini",
  "codex",
  "kimi",
  "vibe",
  "auggie",
  "stakpak",
  "openhands",
  "cagent",
];

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    "no-browser": { type: "boolean" },
  },
  allowPositionals: true,
});

function printHelp() {
  console.log(`
heyatlas - Tunnel local AI agents to the cloud via ACP

Usage:
  heyatlas connect <agent>    Connect agent to Atlas (via ACP protocol)

ACP-Compatible Agents:
  ${SUPPORTED_AGENTS.join(", ")}

Options:
  -h, --help        Show this help message
  -v, --version     Show version
  --no-browser      Don't open browser automatically

Prerequisites:
  - The agent must be installed and support ACP mode
  - Agent-specific setup (API keys, etc.)

Examples:
  heyatlas connect opencode   Connect OpenCode via ACP
  heyatlas connect goose      Connect Goose via ACP
  heyatlas connect claude     Connect Claude Code via ACP
`);
}

async function main() {
  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    console.log("heyatlas v0.1.0");
    process.exit(0);
  }

  const command = positionals[0];

  if (command === "connect") {
    const agent = positionals[1];
    if (!agent) {
      console.error("Error: Agent name required");
      console.error("Usage: heyatlas connect <agent>");
      console.error(`Agents: ${SUPPORTED_AGENTS.join(", ")}`);
      process.exit(1);
    }

    if (!SUPPORTED_AGENTS.includes(agent)) {
      console.error(`Error: Unknown agent '${agent}'`);
      console.error(`Supported agents: ${SUPPORTED_AGENTS.join(", ")}`);
      process.exit(1);
    }

    await connect(agent as AgentType, { 
      openBrowser: !values["no-browser"],
    });
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
