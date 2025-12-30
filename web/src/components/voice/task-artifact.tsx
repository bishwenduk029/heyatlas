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
import { cn } from "@/lib/utils";
import { TaskEventViewer } from "./task-event-viewer";
import type { AtlasTask, StreamEvent } from "./hooks/use-atlas-agent";

interface TaskArtifactProps {
  task: AtlasTask;
  ephemeralEvents?: StreamEvent[];
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

export function TaskArtifact({ task, ephemeralEvents = [], onClose }: TaskArtifactProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { id: taskId, agentId: agentName, state: taskState, context: storedEvents = [] } = task;
  const status = getTaskStatus(taskState);
  const isRunning = taskState === "in-progress" || taskState === "pending";

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [storedEvents.length, ephemeralEvents.length]);

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
        <div ref={contentRef} className="flex-1 overflow-auto p-4">
          <TaskEventViewer
            storedEvents={storedEvents}
            ephemeralEvents={ephemeralEvents}
            isRunning={isRunning}
          />
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
