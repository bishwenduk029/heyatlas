"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactClose,
  ArtifactContent,
} from "@/components/ai-elements/artifact";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import type { AtlasTask } from "./hooks/use-atlas-agent";

interface TaskArtifactProps {
  task: AtlasTask;
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

export function TaskArtifact({ task, onClose }: TaskArtifactProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { id: taskId, agentId: agentName, state: taskState, context: events = [], result } = task;
  const status = getTaskStatus(taskState);
  const isComplete = taskState === "completed" || taskState === "pending-user-feedback";
  const isFailed = taskState === "failed";
  const isRunning = taskState === "in-progress" || taskState === "pending";

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [events]);

  const lastEvent = events[events.length - 1] as any;
  const lastText = lastEvent?.data?.text || lastEvent?.data?.finalText || result || (isRunning ? "Processing..." : "");

  return (
    <Artifact className="h-full w-full">
      <ArtifactHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg icon-glow">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <ArtifactTitle>{agentName}</ArtifactTitle>
            <p className="text-xs text-muted-foreground font-mono">{taskId.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isRunning && (
            <div className={cn("flex items-center gap-1.5 text-xs", status.className)}>
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
              {status.text}
            </div>
          )}
          <ArtifactClose onClick={onClose} />
        </div>
      </ArtifactHeader>
      <ArtifactContent className="p-0 flex flex-col overflow-hidden">
        <div ref={contentRef} className="font-mono text-sm flex-1 overflow-auto whitespace-pre-wrap break-words p-4">
          {events.length === 0 ? (
            <span className={cn(
              "text-muted-foreground",
              isRunning && "animate-pulse"
            )}>
              {isComplete ? (result || "Task completed.") :
               isFailed ? (result || "Task failed.") :
               "Waiting for output..."}
            </span>
          ) : (
            events.map((event, i) => {
              const evt = event as any;
              const data = evt.data || evt;
              const text = data.text || data.finalText;
              if (!text) return null;
              
              const isUser = data.role === "user";
              const isCompletion = evt.type === "completion" || data.type === "completion";
              
              return (
                <div key={i} className={cn(
                  "mb-2",
                  isUser ? "text-blue-400" : 
                  isCompletion ? "text-purple-400" : "text-green-400"
                )}>
                  {isUser ? `> ${text}` : text}
                </div>
              );
            })
          )}
        </div>
        {isRunning && lastText && (
          <div className="text-green-400 mt-2 animate-pulse p-4">
            <Shimmer>{lastText}</Shimmer>
          </div>
        )}
      </ArtifactContent>
    </Artifact>
  );
}
