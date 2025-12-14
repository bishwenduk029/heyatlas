import { BaseCLIAgent } from "./base";

export class GooseAgent extends BaseCLIAgent {
  name = "goose";
  executable = "goose";

  buildCommand(task: string): string[] {
    return [
      "goose",
      "run",
      "-t", // task flag for headless mode
      task,
      "--no-session", // don't persist session state
    ];
  }
}
