"use client";

import { ExternalLink, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { AtlasTask } from "./hooks/use-atlas-agent";

interface TaskArtifactCardProps {
  task: AtlasTask;
  onClick: () => void;
}

function getStatusStyle(state: AtlasTask["state"]) {
  switch (state) {
    case "in-progress":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case "completed":
    case "pending-user-feedback":
      return "bg-green-500/10 text-green-600 border-green-500/20";
    case "failed":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    default:
      return "bg-muted/50 text-muted-foreground";
  }
}

function getLiveOutput(task: AtlasTask): string | null {
  if (task.state !== "in-progress" && task.state !== "pending") return null;
  const last = task.context[task.context.length - 1] as any;
  const data = last?.data || last;
  const text = data?.text || data?.finalText;
  return text && !data.role ? text : null;
}

function getTaskDescription(task: AtlasTask): string {
  if (task.description) return task.description;
  if (task.summary) return task.summary;
  const first = task.context?.[0] as any;
  const firstMessage = first?.content || first?.data?.text;
  if (firstMessage) return firstMessage;
  return `Task ${task.id.slice(0, 8)}`;
}

export function TaskArtifactCard({ task, onClick }: TaskArtifactCardProps) {
  const { id: taskId, agentId: agentName, state: taskState, context: events = [], result } = task;
  const isRunning = taskState === "in-progress" || taskState === "pending";
  const isComplete = taskState === "completed" || taskState === "pending-user-feedback";
  const isFailed = taskState === "failed";
  const liveOutput = getLiveOutput(task);
  const lastText = liveOutput || result || (isRunning ? "Processing..." : "");

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border bg-card shadow-sm transition-all",
        "hover:shadow-md hover:border-primary/50 cursor-pointer",
        getStatusStyle(taskState)
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-background">
            <Terminal className="h-3 w-3" />
          </div>
          <span className="text-xs font-medium">{agentName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs capitalize px-2 py-0.5 rounded-full", getStatusStyle(taskState))}>
            {taskState.replace("-", " ")}
          </span>
          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Description */}
      <div className="px-3 pb-2">
        <p className="text-xs font-medium text-foreground line-clamp-2 mb-1">
          {getTaskDescription(task)}
        </p>

        {/* Live output for in-progress tasks */}
        {isRunning && lastText && (
          <div className="text-xs font-mono text-muted-foreground rounded bg-muted/50 p-2 max-h-24 overflow-hidden">
            <Shimmer>{lastText}</Shimmer>
          </div>
        )}

        {/* Result for completed/failed tasks */}
        {!isRunning && result && (
          <p className="text-xs font-mono text-muted-foreground rounded bg-muted/50 p-2 line-clamp-3">
            {result}
          </p>
        )}

        {/* Empty state */}
        {events.length === 0 && !result && (
          <p className="text-xs text-muted-foreground italic">
            {isComplete ? "Task completed." : isFailed ? "Task failed." : "Waiting for output..."}
          </p>
        )}
      </div>
    </div>
  );
}
