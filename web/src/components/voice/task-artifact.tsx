"use client";

import { useEffect, useRef } from "react";
import { Terminal, Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactClose,
  ArtifactContent,
} from "@/components/ai-elements/artifact";
import { cn } from "@/lib/utils";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  DiffRenderer,
  tryExtractDiff,
} from "@/components/ai-elements/diff-renderer";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AtlasTask } from "./hooks/use-atlas-agent";
import type { UIMessage } from "@ai-sdk/react";

interface TaskArtifactProps {
  task: AtlasTask;
  uiMessage?: UIMessage | null;
  onClose: () => void;
}

function getTaskStatus(state: AtlasTask["state"]) {
  switch (state) {
    case "in-progress":
      return { text: "Running", className: "text-yellow-500" };
    case "completed":
    case "pending-user-feedback":
      return { text: "Complete", className: "text-emerald-500" };
    case "failed":
      return { text: "Failed", className: "text-red-500" };
    default:
      return { text: "Pending", className: "text-muted-foreground" };
  }
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // OpenCode tools
  edit: "Edit",
  edit_file: "Edit",
  multiedit: "Edit",
  read: "Read",
  write: "Write",
  glob: "Glob",
  grep: "Search",
  search: "Search",
  bash: "Shell",
  create_file: "Create",
  delete_file: "Delete",
  todoread: "Tasks",
  todowrite: "Tasks",
  task: "Task",
  webfetch: "Web",
  // Goose tools
  shell: "Shell",
  developer__shell: "Shell",
  developer__text_editor: "Edit",
  developer__read_file: "Read",
  developer__write_file: "Write",
  developer__list_directory: "Glob",
  text_editor: "Edit",
  read_file: "Read",
  write_file: "Write",
  list_directory: "Glob",
};

function getToolDisplayName(name: string): string {
  const lower = name.toLowerCase();
  return TOOL_DISPLAY_NAMES[lower] || name.charAt(0).toUpperCase() + name.slice(1);
}

function isGlobOutput(name: string, output: unknown): string[] | null {
  if (!name.toLowerCase().includes("glob")) return null;
  const str = typeof output === "string"
    ? output
    : typeof output === "object" && output !== null && "output" in output
      ? String((output as { output: unknown }).output)
      : null;
  if (!str) return null;
  const paths = str.split(/\s+/).filter((p) => p.startsWith("/") || p.includes("."));
  return paths.length > 1 ? paths : null;
}

function ToolEntry({
  name,
  state,
  output,
  errorText,
}: {
  name: string;
  state: string;
  output?: unknown;
  errorText?: string;
}) {
  const isComplete = state === "output-available" || state === "output-error";
  const isRunning = state === "input-available" || state === "input-streaming";

  const diffInfo = output ? tryExtractDiff(output) : null;
  const displayName = diffInfo ? "Edit" : getToolDisplayName(name);
  const globPaths = !diffInfo ? isGlobOutput(name, output) : null;

  return (
    <div className="border-l-2 border-primary/30 pl-3 py-1">
      {/* Tool name with status */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {isRunning && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        {isComplete && !errorText && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
        {errorText && <XCircle className="h-3 w-3 text-red-500" />}
        <span>{displayName}</span>
      </div>

      {/* Output */}
      {isComplete && (
        <div className="mt-2">
          {errorText ? (
            <div className="text-sm text-red-500 bg-red-500/10 rounded px-2 py-1">
              {errorText}
            </div>
          ) : diffInfo ? (
            <DiffRenderer
              path={diffInfo.path}
              unifiedDiff={diffInfo.diff}
              defaultExpanded
            />
          ) : globPaths ? (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 font-mono space-y-0.5 max-h-40 overflow-y-auto">
              {globPaths.slice(0, 20).map((p, i) => (
                <div key={i} className="truncate" title={p}>
                  {p.split("/").pop() || p}
                </div>
              ))}
              {globPaths.length > 20 && (
                <div className="text-muted-foreground/60">...and {globPaths.length - 20} more</div>
              )}
            </div>
          ) : output ? (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 font-mono overflow-x-auto">
              {typeof output === "string"
                ? output.slice(0, 500)
                : typeof output === "object" && output !== null && "output" in output
                  ? String((output as { output: unknown }).output).slice(0, 500)
                  : JSON.stringify(output, null, 2).slice(0, 500)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReasoningEntry({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  if (!text) return null;
  
  return (
    <div className="border-l-2 border-yellow-500/30 pl-3 py-1">
      <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
        {isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
        <span>Thinking</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

export function TaskArtifact({ task, uiMessage, onClose }: TaskArtifactProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { id: taskId, agentId: agentName, state: taskState } = task;
  const status = getTaskStatus(taskState);
  const isRunning = taskState === "in-progress" || taskState === "pending";

  // Auto-scroll to bottom
  useEffect(() => {
    if (contentRef.current && uiMessage?.parts?.length) {
      const el = contentRef.current;
      const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (wasAtBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [uiMessage?.parts]);

  return (
    <Artifact className="h-full w-full max-w-full">
      <ArtifactHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col">
            <ArtifactTitle className="truncate">{agentName}</ArtifactTitle>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {taskId.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {isRunning && (
            <div className={cn("flex items-center gap-1.5 text-xs", status.className)}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
              {status.text}
            </div>
          )}
          <ArtifactClose onClick={onClose} />
        </div>
      </ArtifactHeader>
      <ArtifactContent className="flex flex-col overflow-hidden p-0">
        <div ref={contentRef} className="min-w-0 flex-1 space-y-3 overflow-auto p-4">
          {uiMessage?.parts?.map((part, i) => {
            const key = `${uiMessage.id}-${i}`;

            // Reasoning/thinking
            if (part.type === "reasoning") {
              return (
                <ReasoningEntry
                  key={key}
                  text={part.text || ""}
                  isStreaming={part.state === "streaming"}
                />
              );
            }

            // Text response
            if (part.type === "text") {
              return <MessageResponse key={key}>{part.text}</MessageResponse>;
            }

            // Dynamic tool (from ACP)
            if (part.type === "dynamic-tool") {
              return (
                <ToolEntry
                  key={key}
                  name={part.toolName || "tool"}
                  state={part.state}
                  output={part.state === "output-available" ? part.output : undefined}
                  errorText={part.state === "output-error" ? part.errorText : undefined}
                />
              );
            }

            // Legacy tool-* parts
            if (typeof part.type === "string" && part.type.startsWith("tool-")) {
              const toolPart = part as {
                type: string;
                state: string;
                output?: unknown;
                errorText?: string;
              };
              const toolName = toolPart.type.replace("tool-", "");
              return (
                <ToolEntry
                  key={key}
                  name={toolName}
                  state={toolPart.state}
                  output={toolPart.state === "output-available" ? toolPart.output : undefined}
                  errorText={toolPart.state === "output-error" ? toolPart.errorText : undefined}
                />
              );
            }

            return null;
          })}

          {isRunning && !uiMessage?.parts?.length && (
            <div className="text-muted-foreground animate-pulse">
              <Shimmer>Processing...</Shimmer>
            </div>
          )}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
