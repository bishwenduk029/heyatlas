"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { CodeBlock } from "./code-block";
import {
  DiffRenderer,
  tryExtractDiff,
  tryExtractFileDiff,
} from "./diff-renderer";

export type ToolProps = ComponentProps<typeof Collapsible> & {
  defaultOpen?: boolean;
  /** Force open for specific tool types like image generation */
  forceOpen?: boolean;
};

export const Tool = ({
  className,
  defaultOpen,
  forceOpen,
  ...props
}: ToolProps) => (
  <Collapsible
    className={cn("not-prose mb-4 w-full rounded-md border", className)}
    defaultOpen={defaultOpen || forceOpen}
    open={forceOpen ? true : undefined}
    {...props}
  />
);

/**
 * Helper to detect if tool output contains an image
 */
export const isImageOutput = (output: unknown): boolean => {
  if (typeof output === "string") {
    return (
      output.startsWith("data:image/") ||
      (output.length > 1000 && !output.includes(" "))
    );
  }
  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    return (
      typeof obj.imageDataUrl === "string" ||
      (typeof obj.url === "string" &&
        ((obj.url as string).includes("/generated-") ||
          (obj.url as string).includes("/uploads/")))
    );
  }
  return false;
};

export type ToolHeaderProps = {
  title?: string;
  type: ToolUIPart["type"];
  state: ToolUIPart["state"];
  className?: string;
};

const getStatusBadge = (status: ToolUIPart["state"]) => {
  const labels: Record<ToolUIPart["state"], string> = {
    "input-streaming": "Pending",
    "input-available": "Running",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "output-available": "Completed",
    "output-error": "Error",
    "output-denied": "Denied",
  };

  const icons: Record<ToolUIPart["state"], ReactNode> = {
    "input-streaming": <CircleIcon className="size-4" />,
    "input-available": <ClockIcon className="size-4 animate-pulse" />,
    "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-4 p-3",
      className,
    )}
    {...props}
  >
    <div className="flex items-center gap-2">
      <WrenchIcon className="text-muted-foreground size-4" />
      <span className="text-sm font-medium">
        {title ?? type.split("-").slice(1).join("-")}
      </span>
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground data-[state=closed]:animate-out data-[state=open]:animate-in outline-none",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      Parameters
    </h4>
    <div className="bg-muted/50 rounded-md">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolUIPart["output"];
  errorText: ToolUIPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  // Try to detect and render diffs
  const diffInfo = tryExtractDiff(output);
  if (diffInfo) {
    return (
      <div className={cn("p-4", className)} {...props}>
        <DiffRenderer
          path={diffInfo.path}
          unifiedDiff={diffInfo.diff}
          defaultExpanded
        />
      </div>
    );
  }

  // Try before/after file diff - convert to simple display for now
  const fileDiffInfo = tryExtractFileDiff(output);
  if (fileDiffInfo) {
    // Show before/after as text for simplicity
    return (
      <div className={cn("space-y-2 p-4", className)} {...props}>
        <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {fileDiffInfo.path}
        </h4>
        <CodeBlock code={fileDiffInfo.newContent} language="tsx" />
      </div>
    );
  }

  // Check if output is a data URL (from generateImage tool)
  if (typeof output === "string" && output.startsWith("data:image/")) {
    return (
      <div className={cn("p-4", className)} {...props}>
        <img
          src={output}
          alt="Generated image"
          className="max-w-full rounded-lg shadow-md"
        />
      </div>
    );
  }

  // Check if output is raw base64 (fallback)
  if (
    typeof output === "string" &&
    output.length > 1000 &&
    !output.includes(" ")
  ) {
    return (
      <div className={cn("p-4", className)} {...props}>
        <img
          src={`data:image/png;base64,${output}`}
          alt="Generated image"
          className="max-w-full rounded-lg shadow-md"
        />
      </div>
    );
  }

  // Check if output contains an image URL (legacy support)
  if (typeof output === "object" && output !== null && "url" in output) {
    const imageUrl = (output as { url: string }).url;
    if (
      imageUrl &&
      typeof imageUrl === "string" &&
      (imageUrl.includes("/generated-") || imageUrl.includes("/uploads/"))
    ) {
      return (
        <div className={cn("p-4", className)} {...props}>
          <img
            src={imageUrl}
            alt="Generated image"
            className="max-w-full rounded-lg shadow-md"
          />
        </div>
      );
    }
  }

  // Default: render as JSON or text
  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "max-w-full overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground",
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
