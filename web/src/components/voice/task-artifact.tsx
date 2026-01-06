"use client";

import { useState } from "react";
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
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
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

export function TaskArtifact({ task, uiMessage, onClose }: TaskArtifactProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { id: taskId, agentId: agentName, state: taskState } = task;
  const status = getTaskStatus(taskState);
  const isRunning = taskState === "in-progress" || taskState === "pending";

  // Auto-scroll to bottom only when new content is added (not on initial render)
  useEffect(() => {
    if (contentRef.current && uiMessage?.parts?.length) {
      // Only scroll if content was added (not replaced)
      const wasAtBottom =
        contentRef.current.scrollHeight -
          contentRef.current.scrollTop -
          contentRef.current.clientHeight <
        100;
      if (wasAtBottom) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
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
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs",
                status.className,
              )}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
              {status.text}
            </div>
          )}
          <ArtifactClose onClick={onClose} />
        </div>
      </ArtifactHeader>
      <ArtifactContent className="flex flex-col overflow-hidden p-0">
        <div
          ref={contentRef}
          className="min-w-0 flex-1 space-y-3 overflow-auto p-4"
        >
          {uiMessage?.parts?.map((part, i) => {
            const key = `${uiMessage.id}-${i}`;

            // Handle reasoning parts (thinking/planning content)
            if (part.type === "reasoning") {
              const isStreaming = part.state === "streaming";
              return (
                <Reasoning key={key} isStreaming={isStreaming}>
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            }

            // Handle text parts
            if (part.type === "text") {
              return <MessageResponse key={key}>{part.text}</MessageResponse>;
            }

            // Handle dynamic tool parts (from ACP provider)
            if (part.type === "dynamic-tool") {
              const isComplete =
                part.state === "output-available" ||
                part.state === "output-error";
              return (
                <Tool key={key} defaultOpen={isComplete}>
                  <ToolHeader
                    type={`tool-${part.toolName}` as `tool-${string}`}
                    state={part.state}
                    title={part.toolName}
                  />
                  <ToolContent>
                    <ToolInput input={part.input} />
                    {isComplete && (
                      <ToolOutput
                        output={
                          part.state === "output-available"
                            ? part.output
                            : undefined
                        }
                        errorText={
                          part.state === "output-error"
                            ? part.errorText
                            : undefined
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            // Handle tool-* parts
            if (part.type.startsWith("tool-")) {
              const toolPart = part as {
                type: `tool-${string}`;
                toolCallId: string;
                state:
                  | "input-streaming"
                  | "input-available"
                  | "output-available"
                  | "output-error";
                input?: Record<string, unknown>;
                output?: unknown;
                errorText?: string;
              };
              const isComplete =
                toolPart.state === "output-available" ||
                toolPart.state === "output-error";
              return (
                <Tool key={key} defaultOpen={isComplete}>
                  <ToolHeader type={toolPart.type} state={toolPart.state} />
                  <ToolContent>
                    <ToolInput input={toolPart.input} />
                    {isComplete && (
                      <ToolOutput
                        output={
                          toolPart.state === "output-available"
                            ? toolPart.output
                            : undefined
                        }
                        errorText={
                          toolPart.state === "output-error"
                            ? toolPart.errorText
                            : undefined
                        }
                      />
                    )}
                  </ToolContent>
                </Tool>
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
