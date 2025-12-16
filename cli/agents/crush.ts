import { BaseCLIAgent } from "./base";

export class CrushAgent extends BaseCLIAgent {
  name = "crush";
  executable = "crush";

  buildCommand(task: string): string[] {
    return ["crush", "run", "-q", task];
  }
}
