"use client";

import { useEffect, useRef } from "react";
import { X, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AtlasTask, StreamEvent } from "./hooks/use-atlas-agent";

/**
 * TaskViewer - Display task messages from task.context
 * 
 * Context contains only message events with role user/assistant.
 * Simply displays the "text" field from each event.
 */
interface TaskViewerProps {
  task: AtlasTask;
  onClose: () => void;
}

export function TaskViewer({ task, onClose }: TaskViewerProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  
  // Extract properties from task - context is the source of truth for events
  const { id: taskId, agentId: agentName, state: taskState, context: events = [], result } = task;

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [events]);

  const isComplete = taskState === "completed" || taskState === "pending-user-feedback";
  const isFailed = taskState === "failed";
  const isRunning = taskState === "in-progress" || taskState === "pending";

  return (
    <div className="flex h-full w-full flex-col rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg icon-glow">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{agentName}</h2>
            <p className="text-xs text-muted-foreground font-mono">{taskId.slice(0, 8)}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto bg-black p-4 font-mono text-sm"
      >
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
            // StreamEvent wrapper: { type, data: { role, text, finalText } }
            const data = evt.data || evt;
            const text = data.text || data.finalText;
            if (!text) return null;
            
            const isUser = data.role === "user";
            const isCompletion = evt.type === "completion" || data.type === "completion";
            
            return (
              <div key={i} className={cn(
                "whitespace-pre-wrap break-words mb-2",
                isUser ? "text-blue-400" : 
                isCompletion ? "text-purple-400" : "text-green-400"
              )}>
                {isUser ? `> ${text}` : text}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
        <p className="text-xs text-muted-foreground font-mono">
          {events.length} messages
        </p>
        <div className={cn(
          "flex items-center gap-1.5 text-xs",
          isComplete ? "text-emerald-500" : isFailed ? "text-red-500" : "text-yellow-500"
        )}>
          <span className={cn(
            "h-2 w-2 rounded-full",
            isComplete ? "bg-emerald-500" : isFailed ? "bg-red-500" : "bg-yellow-500 animate-pulse"
          )} />
          {isComplete ? "Complete" : isFailed ? "Failed" : isRunning ? "Running" : "Paused"}
        </div>
      </div>
    </div>
  );
}
