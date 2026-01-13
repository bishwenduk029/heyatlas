import type { ReactElement } from "react";

export function renderEmail(component: ReactElement): string {
  const { render } = require("@react-email/render");
  return render(component);
}
