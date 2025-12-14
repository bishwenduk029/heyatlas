import { BaseCLIAgent } from "./base";

export class ClaudeAgent extends BaseCLIAgent {
  name = "claude";
  executable = "claude";

  buildCommand(task: string): string[] {
    return [
      "claude",
      "-p", // headless/print mode
      task,
      "--output-format",
      "text",
      "--verbose",
    ];
  }
}
