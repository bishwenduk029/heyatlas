"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChatWelcome } from "./chat-welcome";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { AtlasTask } from "./hooks/use-atlas-agent";
import type { UIMessage } from "@ai-sdk/react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";

interface MessageListProps {
  messages: UIMessage[];
  userImage?: string;
  onQuickAction?: (text: string) => void;
  tasks?: AtlasTask[];
  onTaskSelect?: (task: AtlasTask) => void;
  compact?: boolean;
  selectedTask?: boolean;
}

export function MessageList({
  messages,
  userImage,
  onQuickAction,
  tasks = [],
  onTaskSelect,
  compact = false,
  selectedTask = false,
}: MessageListProps) {
  // Ref to control scroll behavior
  const scrollContextRef = useRef<StickToBottomContext | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollContextRef.current && messages.length > 0) {
      // Scroll to bottom whenever messages change
      scrollContextRef.current.scrollToBottom();
    }
  }, [messages.length]); // Trigger on message count change

  return (
    <Conversation
      className="my-2 h-[calc(100vh-250px)] w-full transition-all duration-300 ease-in-out"
      initial="instant"
      contextRef={scrollContextRef}
    >
      <ConversationContent
        className={
          selectedTask
            ? "h-full w-full gap-4 p-0 md:gap-6 md:p-6"
            : "mx-auto h-full gap-4 p-0 md:w-1/2 md:gap-6 md:p-6"
        }
      >
        {messages.length === 0 ? (
          <ConversationEmptyState>
            <ChatWelcome onAction={onQuickAction} />
          </ConversationEmptyState>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="border-border hover:bg-muted/30 flex items-start gap-4 border-b p-4 transition-colors last:border-0"
              >
                <Avatar
                  className={cn(
                    "h-10 w-10 shrink-0 shadow-sm",
                    msg.role === "user" ? "bg-[#5865f2]" : "",
                  )}
                >
                  {msg.role === "user" ? (
                    <>
                      <AvatarImage src={userImage} />
                      <AvatarFallback className="bg-transparent text-white">
                        <User className="h-6 w-6" />
                      </AvatarFallback>
                    </>
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center rounded-full p-2" style={{ background: "var(--logo-gradient)" }}>
                      <Image
                        src="/logo.svg"
                        alt="Atlas"
                        width={24}
                        height={24}
                        className="relative brightness-0 invert"
                      />
                    </div>
                  )}
                </Avatar>
                <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        msg.role === "user"
                          ? "text-[#5865f2]"
                          : "text-[oklch(0.646_0.222_41)]",
                      )}
                    >
                      {msg.role === "user" ? "You" : "Atlas"}
                    </span>
                    <span className="text-muted-foreground text-[10px] tracking-tighter uppercase opacity-50">
                      {new Date().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {msg.parts.map((part, i) => {
                    const key = `${msg.id}-${i}`;
                    
                    // Handle text parts
                    if (part.type === "text") {
                      return (
                        <MessageResponse
                          key={key}
                          className="text-foreground/90 prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                        >
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    
                    // Handle tool invocation parts (dynamic tools)
                    if (part.type === "dynamic-tool") {
                      const isComplete = part.state === "output-available" || part.state === "output-error";
                      return (
                        <Tool key={key} defaultOpen={false}>
                          <ToolHeader
                            type={`tool-${part.toolName}` as `tool-${string}`}
                            state={part.state}
                            title={part.toolName}
                          />
                          <ToolContent>
                            <ToolInput input={part.input} />
                            {isComplete && (
                              <ToolOutput
                                output={part.state === "output-available" ? part.output : undefined}
                                errorText={part.state === "output-error" ? part.errorText : undefined}
                              />
                            )}
                          </ToolContent>
                        </Tool>
                      );
                    }
                    
                    // Handle specific tool parts (tool-{toolName} pattern)
                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as {
                        type: `tool-${string}`;
                        toolCallId: string;
                        state: "input-streaming" | "input-available" | "output-available" | "output-error";
                        input?: Record<string, unknown>;
                        output?: unknown;
                        errorText?: string;
                      };
                      const isComplete = toolPart.state === "output-available" || toolPart.state === "output-error";
                      return (
                        <Tool key={key} defaultOpen={false}>
                          <ToolHeader
                            type={toolPart.type}
                            state={toolPart.state}
                          />
                          <ToolContent>
                            <ToolInput input={toolPart.input} />
                            {isComplete && (
                              <ToolOutput
                                output={toolPart.state === "output-available" ? toolPart.output : undefined}
                                errorText={toolPart.state === "output-error" ? toolPart.errorText : undefined}
                              />
                            )}
                          </ToolContent>
                        </Tool>
                      );
                    }
                    
                    // Handle step-start parts (multi-step tool calls)
                    if (part.type === "step-start" && i > 0) {
                      return (
                        <hr
                          key={key}
                          className="my-3 border-border/50"
                        />
                      );
                    }
                    
                    return null;
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
