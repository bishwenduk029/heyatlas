#!/usr/bin/env bun
/**
 * heyatlas CLI - Tunnel local AI agents to the cloud
 */

import { parseArgs } from "util";
import { warp } from "./commands/warp";
import type { AgentType } from "./agents";

const SUPPORTED_AGENTS = [
  "opencode",
  "droid",
  "gemini",
  "codex",
  "claude",
  "goose",
  "crush",
];

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    "no-browser": { type: "boolean" },
  },
  allowPositionals: true,
});

function printHelp() {
  console.log(`
heyatlas - Tunnel local AI agents to the cloud

Usage:
  heyatlas warp <agent>    Connect local agent to cloud

Agents:
  ${SUPPORTED_AGENTS.join(", ")}

Options:
  -h, --help        Show this help message
  -v, --version     Show version
  --no-browser      Don't open browser automatically

Examples:
  heyatlas warp codex      Warp Codex agent
  heyatlas warp claude     Warp Claude Code
  heyatlas warp opencode   Warp OpenCode
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

  if (command === "warp") {
    const agent = positionals[1];
    if (!agent) {
      console.error("Error: Agent name required");
      console.error("Usage: heyatlas warp <agent>");
      console.error(`Agents: ${SUPPORTED_AGENTS.join(", ")}`);
      process.exit(1);
    }

    if (!SUPPORTED_AGENTS.includes(agent)) {
      console.error(`Error: Unknown agent '${agent}'`);
      console.error(`Supported agents: ${SUPPORTED_AGENTS.join(", ")}`);
      process.exit(1);
    }

    await warp(agent as AgentType, { openBrowser: !values["no-browser"] });
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
