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
  const { id: taskId, agentId: agentName, state: taskState, context: storedEvents = [], result } = task;
  const status = getTaskStatus(taskState);
  const isComplete = taskState === "completed" || taskState === "pending-user-feedback";
  const isFailed = taskState === "failed";
  const isRunning = taskState === "in-progress" || taskState === "pending";

  // Merge stored + ephemeral events, sorted by timestamp
  const allEvents = [...storedEvents, ...ephemeralEvents].sort((a: any, b: any) => 
    (a.timestamp || 0) - (b.timestamp || 0)
  );

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [allEvents.length]);

  const lastEvent = allEvents[allEvents.length - 1] as any;
  const lastRaw = lastEvent?.data?.text || lastEvent?.data?.content || lastEvent?.data?.finalText || result;
  const lastText = typeof lastRaw === 'string' ? lastRaw : (isRunning ? "Processing..." : "");

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
          {allEvents.length === 0 ? (
            <span className={cn(
              "text-muted-foreground",
              isRunning && "animate-pulse"
            )}>
              {isComplete ? (result || "Task completed.") :
               isFailed ? (result || "Task failed.") :
               "Waiting for output..."}
            </span>
          ) : (
            // Accumulate consecutive message chunks by role
            (() => {
              const blocks: { role: string; text: string; type: string }[] = [];
              
              for (const event of allEvents) {
                const evt = event as any;
                const data = evt.data || evt;
                let rawText = data.text || data.content || data.finalText;
                if (rawText && typeof rawText === 'object' && rawText.text) {
                  rawText = rawText.text;
                }
                const text = typeof rawText === 'string' ? rawText : '';
                if (!text) continue;
                
                const role = data.role || 'assistant';
                const type = evt.type || 'message';
                const lastBlock = blocks[blocks.length - 1];
                
                // Combine consecutive messages from same role
                if (lastBlock && lastBlock.role === role && type === 'message') {
                  lastBlock.text += text;
                } else {
                  blocks.push({ role, text, type });
                }
              }
              
              return blocks.map((block, i) => {
                const trimmed = block.text.trim();
                if (!trimmed) return null;
                
                const isUser = block.role === 'user';
                const isCompletion = block.type === 'completion';
                const isFirst = i === 0;
                
                return (
                  <div key={i}>
                    {/* Divider line between messages */}
                    {!isFirst && (
                      <div className="border-t border-border/50 my-3" />
                    )}
                    <div className={cn(
                      "py-1",
                      isUser 
                        ? "text-primary font-medium" 
                        : isCompletion 
                          ? "text-muted-foreground italic" 
                          : "text-foreground"
                    )}>
                      {isUser && (
                        <span className="text-muted-foreground mr-2">{">"}</span>
                      )}
                      {trimmed}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
        {isRunning && lastText && (
          <div className="border-t border-border/50 mt-2 p-4">
            <div className="text-muted-foreground animate-pulse">
              <Shimmer>{lastText}</Shimmer>
            </div>
          </div>
        )}
      </ArtifactContent>
    </Artifact>
  );
}
