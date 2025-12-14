import { BaseCLIAgent } from "./base";

/**
 * CodexAgent - OpenAI Codex CLI
 *
 * Note: As of late 2025, Codex CLI has limited headless support.
 * See: https://github.com/openai/codex/issues/4219
 * It may panic or block in non-interactive environments.
 */
export class CodexAgent extends BaseCLIAgent {
  name = "codex";
  executable = "codex";

  buildCommand(task: string): string[] {
    return [
      "codex",
      task,
    ];
  }
}
