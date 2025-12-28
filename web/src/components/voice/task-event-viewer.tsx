"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Terminal, Wrench, Brain, ListTodo, Info } from "lucide-react";
import type { StreamEvent } from "./hooks/use-atlas-agent";

interface TaskEventViewerProps {
  storedEvents: StreamEvent[];
  ephemeralEvents: StreamEvent[];
  isRunning?: boolean;
}

interface MergedEvent extends StreamEvent {
  isEphemeral: boolean;
}

function getEventIcon(type: string) {
  switch (type) {
    case "tool_call":
    case "tool_update":
      return <Wrench className="h-3 w-3" />;
    case "thinking":
      return <Brain className="h-3 w-3" />;
    case "plan":
      return <ListTodo className="h-3 w-3" />;
    case "status":
      return <Info className="h-3 w-3" />;
    default:
      return <Terminal className="h-3 w-3" />;
  }
}

function getEventStyle(type: string, isEphemeral: boolean) {
  const baseStyle = isEphemeral ? "opacity-80" : "";
  
  switch (type) {
    case "message":
      return cn(baseStyle, "text-foreground");
    case "tool_call":
      return cn(baseStyle, "text-amber-500");
    case "tool_update":
      return cn(baseStyle, "text-amber-400");
    case "thinking":
      return cn(baseStyle, "text-purple-400 italic");
    case "plan":
      return cn(baseStyle, "text-blue-400");
    case "status":
      return cn(baseStyle, "text-muted-foreground text-xs");
    case "completion":
      return cn(baseStyle, "text-emerald-500");
    default:
      return cn(baseStyle, "text-muted-foreground");
  }
}

function EventItem({ event, isEphemeral }: { event: MergedEvent; isEphemeral: boolean }) {
  const { type, data } = event;
  const style = getEventStyle(type, isEphemeral);
  
  // Extract display text based on event type
  const getText = (): string | null => {
    switch (type) {
      case "message": {
        const content = data.content || data.text;
        const role = data.role as string;
        return role === "user" ? `> ${content}` : content as string;
      }
      case "tool_call": {
        const toolName = data.toolName || data.name;
        return `[Tool] ${toolName}`;
      }
      case "tool_update": {
        const status = data.status;
        const output = data.output;
        if (output) return `  └─ ${String(output).slice(0, 200)}${String(output).length > 200 ? '...' : ''}`;
        return status ? `  └─ ${status}` : null;
      }
      case "thinking":
        return data.text as string;
      case "plan": {
        const entries = data.entries as Array<{ title: string }>;
        if (!entries?.length) return null;
        return entries.map(e => `• ${e.title}`).join('\n');
      }
      case "status":
        return data.text as string;
      case "completion":
        return (data.summary as string) || (data.text as string);
      default:
        return data.text as string || null;
    }
  };
  
  const text = getText();
  if (!text) return null;
  
  return (
    <div className={cn("flex items-start gap-2 mb-1.5", style)}>
      {isEphemeral && (
        <span className="mt-0.5 flex-shrink-0">
          {getEventIcon(type)}
        </span>
      )}
      <span className={cn("whitespace-pre-wrap break-words", !isEphemeral && "ml-5")}>
        {text}
      </span>
    </div>
  );
}

export function TaskEventViewer({ storedEvents, ephemeralEvents, isRunning }: TaskEventViewerProps) {
  // Merge stored and ephemeral events, sorted by timestamp
  const mergedEvents = useMemo(() => {
    const stored: MergedEvent[] = storedEvents.map(e => ({ ...e, isEphemeral: false }));
    const ephemeral: MergedEvent[] = ephemeralEvents.map(e => ({ ...e, isEphemeral: true }));
    return [...stored, ...ephemeral].sort((a, b) => a.timestamp - b.timestamp);
  }, [storedEvents, ephemeralEvents]);
  
  const lastEvent = mergedEvents[mergedEvents.length - 1];
  const lastText = (lastEvent?.data?.text || lastEvent?.data?.content) as string | undefined;
  
  if (mergedEvents.length === 0) {
    return (
      <div className={cn("text-muted-foreground", isRunning && "animate-pulse")}>
        {isRunning ? "Waiting for output..." : "No events"}
      </div>
    );
  }
  
  return (
    <div className="space-y-0.5">
      {mergedEvents.map((event, i) => (
        <EventItem key={`${event.timestamp}-${i}`} event={event} isEphemeral={event.isEphemeral} />
      ))}
      {isRunning && lastText && (
        <div className="text-emerald-400 mt-2 animate-pulse">
          <Shimmer>{String(lastText)}</Shimmer>
        </div>
      )}
    </div>
  );
}
