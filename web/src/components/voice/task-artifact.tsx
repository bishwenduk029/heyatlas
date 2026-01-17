"use client";

import { useEffect, useRef } from "react";
import { Terminal, Loader2, CheckCircle2, XCircle, Users, GitBranch, Play, ArrowRight } from "lucide-react";
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

// Workforce event types from agent-smith
interface WorkforceEvent {
  event_type: string;
  timestamp: number;
  task_id?: string;
  task_content?: string;
  worker_name?: string;
  result?: string;
  error?: string;
  subtasks?: string[];
}

function WorkforceEventEntry({ event }: { event: WorkforceEvent }) {
  const getEventIcon = () => {
    switch (event.event_type) {
      case "task_created":
      case "task_started":
        return <Play className="h-3 w-3 text-blue-500" />;
      case "task_assigned":
        return <ArrowRight className="h-3 w-3 text-purple-500" />;
      case "task_decomposed":
        return <GitBranch className="h-3 w-3 text-cyan-500" />;
      case "task_completed":
      case "all_tasks_completed":
        return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
      case "task_failed":
        return <XCircle className="h-3 w-3 text-red-500" />;
      case "worker_created":
        return <Users className="h-3 w-3 text-amber-500" />;
      default:
        return <Terminal className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getEventColor = () => {
    switch (event.event_type) {
      case "task_completed":
      case "all_tasks_completed":
        return "border-emerald-500/30";
      case "task_failed":
        return "border-red-500/30";
      case "task_assigned":
        return "border-purple-500/30";
      case "task_decomposed":
        return "border-cyan-500/30";
      case "worker_created":
        return "border-amber-500/30";
      default:
        return "border-blue-500/30";
    }
  };

  const getEventLabel = () => {
    switch (event.event_type) {
      case "task_created":
        return "Task Created";
      case "task_started":
        return "Started";
      case "task_assigned":
        return `Assigned → ${event.worker_name || "Worker"}`;
      case "task_decomposed":
        return "Decomposed";
      case "task_completed":
        return "Completed";
      case "task_failed":
        return "Failed";
      case "worker_created":
        return `Worker: ${event.worker_name}`;
      case "all_tasks_completed":
        return "All Tasks Done";
      default:
        return event.event_type;
    }
  };

  return (
    <div className={cn("border-l-2 pl-3 py-1", getEventColor())}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {getEventIcon()}
        <span>{getEventLabel()}</span>
      </div>
      
      {event.task_content && (
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {event.task_content}
        </div>
      )}
      
      {event.subtasks && event.subtasks.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {event.subtasks.map((st, i) => (
            <div key={i} className="text-xs text-muted-foreground/70 pl-2 truncate">
              • {st}
            </div>
          ))}
        </div>
      )}
      
      {event.result && (
        <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 truncate">
          {event.result}
        </div>
      )}
      
      {event.error && (
        <div className="mt-1 text-xs text-red-500 truncate">
          {event.error}
        </div>
      )}
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

            // Workforce events from agent-smith
            const partType = (part as { type: string }).type;
            if (partType === "workforce_event") {
              // Event data can be nested under 'event' or 'data'
              const eventPart = part as unknown as { event?: WorkforceEvent; data?: WorkforceEvent };
              const event = eventPart.event || eventPart.data;
              if (event && event.event_type !== "result") {
                return <WorkforceEventEntry key={key} event={event} />;
              }
              return null;
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
