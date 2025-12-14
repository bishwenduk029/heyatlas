"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface MCPFormEntryProps {
  resource: {
    uri: string;
    mimeType: string;
    text: string;
  };
  timestamp: number;
  submittedValue?: string;
  onSubmit?: (value: string) => void;
}

export function MCPFormEntry({
  resource,
  timestamp,
  submittedValue,
  onSubmit,
}: MCPFormEntryProps) {
  const [isSubmitted, setIsSubmitted] = useState(!!submittedValue);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const time = new Date(timestamp);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";

  useEffect(() => {
    if (!iframeRef.current || isSubmitted) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "mcp-ui-submit" && event.data?.data) {
        const { userInput } = event.data.data;
        setIsSubmitted(true);
        onSubmit?.(userInput);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isSubmitted, onSubmit]);

  return (
    <li className="group flex flex-col gap-2 items-start">
      {/* Timestamp */}
      <span className="flex items-center gap-2 text-xs">
        <strong className="font-medium text-muted-foreground">Assistant</strong>
        <span className="text-muted-foreground/60 font-mono text-[10px] opacity-0 transition-opacity ease-linear group-hover:opacity-100">
          {time.toLocaleTimeString(locale, { timeStyle: "short" })}
        </span>
      </span>

      {/* Form Container */}
      <div
        className={cn(
          "w-full max-w-[500px] rounded-lg border overflow-hidden transition-all duration-300",
          isSubmitted
            ? "opacity-60 pointer-events-none bg-muted/50"
            : "bg-card shadow-sm"
        )}
      >
        {isSubmitted ? (
          // Submitted state - show summary
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Check className="h-4 w-4" />
              Form Submitted
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Value:</span>{" "}
              <span className="text-foreground">{submittedValue}</span>
            </div>
          </div>
        ) : (
          // Active state - show form
          <iframe
            ref={iframeRef}
            srcDoc={resource.text}
            className="w-full border-0"
            style={{ minHeight: "400px" }}
            title="MCP UI Form"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </li>
  );
}
