declare module "ai-elements" {
  import type { ReactNode } from "react";

  interface ReasoningProps {
    children: ReactNode;
    state?: "streaming" | "done";
  }

  export function Reasoning(props: ReasoningProps): JSX.Element;
}
