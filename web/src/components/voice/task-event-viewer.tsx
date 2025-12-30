"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Brain, ListChecks, Info, CheckCircle, ShieldQuestion } from "lucide-react";
import type { StreamEvent } from "./hooks/use-atlas-agent";

interface TaskEventViewerProps {
  storedEvents: StreamEvent[];
  ephemeralEvents: StreamEvent[];
  isRunning?: boolean;
}

// Processed tool state (merged from tool_call + tool_update events)
interface ToolState {
  id: string;
  name: string;
  kind?: string;
  status: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

// Processed display item
type DisplayItem =
  | { type: "message"; role: string; content: string }
  | { type: "tool"; tool: ToolState }
  | { type: "thinking"; content: string }
  | { type: "plan"; entries: Array<{ title?: string; content?: string; status?: string }> }
  | { type: "status"; message: string }
  | { type: "completion"; summary: string }
  | { type: "permission"; title: string; options: Array<{ id: string; name: string; kind: string }> };

/**
 * Extract text from content that may be string or {text, type} object
 */
function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

/**
 * Clean agent-specific XML markup from message content.
 * Goose outputs <minimax:tool_call> XML in its messages.
 */
function cleanMessageContent(content: string): string {
  if (!content) return content;
  // Remove goose's XML tool call syntax
  let cleaned = content.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '');
  cleaned = cleaned.replace(/<invoke[\s\S]*?<\/invoke>/g, '');
  return cleaned.trim();
}

/**
 * Check if content looks like code/SVG rather than natural language.
 * Skip streaming chunks that are raw code output.
 */
function isCodeLikeContent(text: string): boolean {
  if (!text || text.length < 3) return false;
  
  // SVG path data patterns
  if (/^[MLHVCSQTAZ\d\s.,\-]+$/i.test(text)) return true;
  
  // Mostly numbers and punctuation (like "74.9454 12.3216")
  const nonCodeChars = text.replace(/[\d\s.,\-(){}\[\]<>\/="'`;:]/g, "");
  if (nonCodeChars.length < text.length * 0.3) return true;
  
  // Single characters or very short fragments
  if (text.trim().length <= 2) return true;
  
  return false;
}

/**
 * Process raw events into clean display items.
 * - Accumulates message deltas into single messages
 * - Merges tool_call + tool_update by ID
 * - Filters out status/rpc noise
 */
function processEvents(events: StreamEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  const tools = new Map<string, ToolState>();

  for (const event of events) {
    const { type, data } = event;

    switch (type) {
      case "message": {
        const role = (data.role as string) || "assistant";
        const rawContent = extractText(data.content) || extractText(data.text) || extractText(data);
        const content = cleanMessageContent(rawContent);
        const isDelta = data.delta as boolean;

        // Skip streaming deltas - only show complete messages
        // This avoids showing raw code/SVG chunks during generation
        if (isDelta) {
          break;
        }

        // Complete message - add if not duplicate
        if (content && content.trim()) {
          const lastItem = items[items.length - 1];
          if (!(lastItem?.type === "message" && lastItem.role === role && lastItem.content === content)) {
            items.push({ type: "message", role, content });
          }
        }
        break;
      }

      case "tool_call": {
        const id = (data.id as string) || (data.toolCallId as string) || "";
        const name = (data.name as string) || (data.toolName as string) || "tool";
        const existing = tools.get(id);
        tools.set(id, {
          ...existing,
          id,
          name,
          kind: (data.kind as string) || existing?.kind,
          status: (data.status as string) || existing?.status || "pending",
          input: (data.args as Record<string, unknown>) || (data.input as Record<string, unknown>) || existing?.input,
        });
        break;
      }

      case "tool_update": {
        const id = (data.id as string) || (data.toolCallId as string) || "";
        const existing = tools.get(id);
        if (existing) {
          tools.set(id, {
            ...existing,
            status: (data.status as string) || existing.status,
            output: data.content ?? data.output ?? existing.output,
          });
        }
        break;
      }

      case "thinking": {
        const content = extractText(data.content) || extractText(data.text);
        if (content) {
          items.push({ type: "thinking", content });
        }
        break;
      }

      case "plan": {
        const entries = data.entries as Array<{ title?: string; content?: string; status?: string }>;
        if (entries?.length) {
          items.push({ type: "plan", entries });
        }
        break;
      }

      case "status": {
        const message = extractText(data.message) || extractText(data.text);
        if (message && !message.includes("Unknown update")) {
          items.push({ type: "status", message });
        }
        break;
      }

      case "completion": {
        const summary = extractText(data.summary) || extractText(data.text);
        if (summary) {
          items.push({ type: "completion", summary });
        }
        break;
      }

      case "permission": {
        const title = (data.title as string) || "Permission Request";
        const options = (data.options as Array<{ id: string; name: string; kind: string }>) || [];
        items.push({ type: "permission", title, options });
        break;
      }
    }
  }

  // Add tools in order they were created
  for (const tool of tools.values()) {
    items.push({ type: "tool", tool });
  }

  return items;
}

// Map ACP status to ai-elements ToolUIPart state
function mapToolState(status: string): "input-streaming" | "input-available" | "output-available" | "output-error" {
  switch (status) {
    case "pending":
      return "input-streaming";
    case "in_progress":
      return "input-available";
    case "completed":
      return "output-available";
    case "error":
    case "failed":
      return "output-error";
    default:
      return "input-available";
  }
}

export function TaskEventViewer({ storedEvents, ephemeralEvents, isRunning }: TaskEventViewerProps) {
  const allEvents = useMemo(
    () => [...storedEvents, ...ephemeralEvents].sort((a, b) => a.timestamp - b.timestamp),
    [storedEvents, ephemeralEvents]
  );

  const items = useMemo(() => processEvents(allEvents), [allEvents]);

  if (items.length === 0) {
    return (
      <div className={cn("text-muted-foreground", isRunning && "animate-pulse")}>
        {isRunning ? "Waiting for output..." : "No events"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const key = `${item.type}-${i}`;

        switch (item.type) {
          case "message":
            return (
              <div key={key} className={cn(item.role === "user" && "text-muted-foreground")}>
                {item.role === "user" && <span className="text-xs opacity-50 mr-2">&gt;</span>}
                <MessageResponse className="prose prose-sm dark:prose-invert max-w-none inline">
                  {item.content}
                </MessageResponse>
              </div>
            );

          case "tool": {
            const { tool } = item;
            const state = mapToolState(tool.status);
            const isComplete = state === "output-available" || state === "output-error";
            return (
              <Tool key={key} defaultOpen={isComplete}>
                <ToolHeader
                  type={`tool-${tool.name}` as `tool-${string}`}
                  state={state}
                  title={tool.name}
                />
                <ToolContent>
                  {tool.input && <ToolInput input={tool.input} />}
                  {isComplete && (
                    <ToolOutput
                      output={state === "output-available" ? tool.output : undefined}
                      errorText={state === "output-error" ? String(tool.output || "Error") : undefined}
                    />
                  )}
                </ToolContent>
              </Tool>
            );
          }

          case "thinking":
            return (
              <div key={key} className="flex items-start gap-2 text-purple-400 italic text-sm">
                <Brain className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{item.content}</span>
              </div>
            );

          case "plan":
            return (
              <div key={key} className="flex items-start gap-2 text-blue-400 text-sm">
                <ListChecks className="h-4 w-4 mt-0.5 shrink-0" />
                <ul className="space-y-1">
                  {item.entries.map((entry, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <span>{entry.title || entry.content}</span>
                      {entry.status && (
                        <span className="text-xs opacity-50">({entry.status})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );

          case "status":
            return (
              <div key={key} className="flex items-center gap-2 text-muted-foreground text-xs">
                <Info className="h-3 w-3 shrink-0" />
                <span>{item.message}</span>
              </div>
            );

          case "completion":
            return (
              <div key={key} className="flex items-start gap-2 text-emerald-500 text-sm">
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
                  {item.summary}
                </MessageResponse>
              </div>
            );

          case "permission":
            return (
              <div key={key} className="flex items-start gap-2 text-amber-500 text-sm border border-amber-500/20 rounded-md p-2 bg-amber-500/5">
                <ShieldQuestion className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{item.title}</div>
                  {item.options.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Options: {item.options.map(o => o.name).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            );

          default:
            return null;
        }
      })}

      {isRunning && (
        <div className="text-muted-foreground animate-pulse">
          <Shimmer>Processing...</Shimmer>
        </div>
      )}
    </div>
  );
}
