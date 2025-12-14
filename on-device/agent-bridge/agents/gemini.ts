import { BaseCLIAgent } from "./base";

export class GeminiAgent extends BaseCLIAgent {
  name = "gemini";
  executable = "gemini";

  buildCommand(task: string): string[] {
    return [
      "gemini",
      "--prompt", // headless mode flag
      task,
    ];
  }
}
