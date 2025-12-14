import { BaseCLIAgent } from "./base";

export class DroidAgent extends BaseCLIAgent {
  name = "droid";
  executable = "droid";

  buildCommand(task: string): string[] {
    return [
      "droid",
      "exec",
      task,
      "--auto", // autonomy level for headless mode
      "high",
    ];
  }
}
