"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

interface ReasoningProps {
  children: string;
  state?: "streaming" | "done";
  className?: string;
}

export function Reasoning({ children, state, className }: ReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasContent = children.trim().length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <div className={cn("rounded-lg border border-yellow-500/30 bg-yellow-500/10", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-yellow-600 dark:text-yellow-400"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            {state === "streaming" && <Loader2 className="h-3 w-3 animate-spin" />}
            Thinking
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          {state === "streaming" && children.length === 0 ? (
            <Shimmer>Thinking...</Shimmer>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-xs text-yellow-600/80 dark:text-yellow-400/80 font-mono">
              {children}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
