import { BaseCLIAgent } from "./base";

export class OpencodeAgent extends BaseCLIAgent {
  name = "opencode";
  executable = "opencode";

  buildCommand(task: string): string[] {
    return [
      "opencode",
      "run", // headless run mode
      task,
    ];
  }
}
