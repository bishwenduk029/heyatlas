"use client";

import { useState, useMemo, Component, type ReactNode } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, FileIcon, PlusIcon, MinusIcon } from "lucide-react";

class DiffErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface DiffRendererProps {
  path: string;
  unifiedDiff: string;
  defaultExpanded?: boolean;
  className?: string;
}

const UNIFIED_DIFF_PATTERNS = [
  /^diff --git/m,
  /^Index:/m,
  /^---.*\n\+\+\+/m,
  /^@@\s*-\d+,?\d*\s*\+\d+,?\d*\s*@@/m,
];

export function isUnifiedDiff(text: string): boolean {
  return UNIFIED_DIFF_PATTERNS.some((pattern) => pattern.test(text));
}

// OpenCode uses a simple before/after format with -/+ prefixed lines
export function isSimpleDiff(text: string): boolean {
  const lines = text.split("\n");
  let hasAddition = false;
  let hasDeletion = false;
  for (const line of lines) {
    if (line.startsWith("-") && !line.startsWith("---")) hasDeletion = true;
    if (line.startsWith("+") && !line.startsWith("+++")) hasAddition = true;
  }
  return hasAddition || hasDeletion;
}

function extractDiffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

export function DiffRenderer({
  path,
  unifiedDiff,
  defaultExpanded = false,
  className,
}: DiffRendererProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const stats = useMemo(() => extractDiffStats(unifiedDiff), [unifiedDiff]);
  const fileName = path.split("/").pop() || path;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-t-md border px-3 py-2",
            "bg-muted/50 text-left text-sm hover:bg-muted/80 transition-colors",
            !isOpen && "rounded-b-md"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono text-xs truncate" title={path}>
              {fileName}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {stats.additions > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
                <PlusIcon className="h-3 w-3" />
                {stats.additions}
              </span>
            )}
            {stats.deletions > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400">
                <MinusIcon className="h-3 w-3" />
                {stats.deletions}
              </span>
            )}
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-md overflow-hidden">
          <DiffErrorBoundary
            fallback={
              <pre className="p-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-60">
                {unifiedDiff}
              </pre>
            }
          >
            <PatchDiff
              patch={unifiedDiff}
              options={{ diffStyle: "unified" }}
            />
          </DiffErrorBoundary>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function tryExtractDiff(output: unknown): { path: string; diff: string } | null {
  if (!output || typeof output !== "object") return null;
  
  // Handle Goose array format: [{ content: { text: "..." } }]
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item?.content?.text && typeof item.content.text === "string") {
        const text = item.content.text;
        if (isUnifiedDiff(text) || isSimpleDiff(text)) {
          const lines = text.split("\n");
          const pathLine = lines.find((l: string) => l.startsWith("/") || l.match(/^[ab]\//));
          const path = pathLine?.replace(/^[ab]\//, "").trim() || "file";
          return { path, diff: text };
        }
      }
    }
    return null;
  }
  
  const obj = output as Record<string, unknown>;

  // Check output.diff
  if (typeof obj.diff === "string" && (isUnifiedDiff(obj.diff) || isSimpleDiff(obj.diff))) {
    const path = (obj.path as string) || (obj.file as string) || "file";
    return { path, diff: obj.diff };
  }

  // Check output.metadata.diff (OpenCode format)
  if (obj.metadata && typeof obj.metadata === "object") {
    const meta = obj.metadata as Record<string, unknown>;
    if (typeof meta.diff === "string" && (isUnifiedDiff(meta.diff) || isSimpleDiff(meta.diff))) {
      const path = (meta.path as string) || (meta.file as string) || "file";
      return { path, diff: meta.diff };
    }
  }

  // Check if output field itself contains a diff
  if (typeof obj.output === "string" && (isUnifiedDiff(obj.output) || isSimpleDiff(obj.output))) {
    const lines = obj.output.split("\n");
    const pathLine = lines.find(l => l.startsWith("/") || l.includes("."));
    const path = pathLine?.trim() || "file";
    return { path, diff: obj.output };
  }

  return null;
}

export function tryExtractFileDiff(output: unknown): {
  path: string;
  oldContent: string;
  newContent: string;
} | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;

  // Check metadata.filediff (OpenCode before/after format)
  if (obj.metadata && typeof obj.metadata === "object") {
    const meta = obj.metadata as Record<string, unknown>;
    if (meta.filediff && typeof meta.filediff === "object") {
      const fd = meta.filediff as Record<string, unknown>;
      if (typeof fd.before === "string" && typeof fd.after === "string") {
        const path = (fd.path as string) || (meta.path as string) || "unknown";
        return { path, oldContent: fd.before, newContent: fd.after };
      }
    }
  }

  return null;
}
