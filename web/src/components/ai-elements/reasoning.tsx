"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ReasoningProps {
  children: React.ReactNode;
  isStreaming?: boolean;
  className?: string;
}

export function Reasoning({ children, isStreaming, className }: ReasoningProps) {
  const [open, setOpen] = useState(true);

  // Auto-expand when streaming
  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    }
  }, [isStreaming]);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={className}>
      {children}
    </Collapsible.Root>
  );
}

interface ReasoningTriggerProps {
  title?: string;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => React.ReactNode;
  className?: string;
}

export function ReasoningTrigger({
  title = "Reasoning",
  getThinkingMessage,
  className,
}: ReasoningTriggerProps) {
  const [duration, setDuration] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Collapsible.Trigger
      asChild
      className={cn(
        "flex w-full items-center justify-between rounded-lg border border-yellow-500/30",
        "bg-yellow-500/10 px-3 py-2 text-left cursor-pointer",
        "hover:bg-yellow-500/15 transition-colors",
        className
      )}
    >
      <button type="button" className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            {title}
            {getThinkingMessage ? (
              getThinkingMessage(true, duration)
            ) : (
              <>
                <span className="animate-pulse">...</span>
              </>
            )}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-yellow-600/60" />
        ) : (
          <ChevronDown className="h-4 w-4 text-yellow-600/60" />
        )}
      </button>
    </Collapsible.Trigger>
  );
}

interface ReasoningContentProps {
  children: React.ReactNode;
  className?: string;
}

export function ReasoningContent({ children, className }: ReasoningContentProps) {
  return (
    <Collapsible.Content
      className={cn(
        "overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
        className
      )}
    >
      <div className="p-3 text-sm text-yellow-600/80 dark:text-yellow-400/80 font-mono whitespace-pre-wrap">
        {children}
      </div>
    </Collapsible.Content>
  );
}
