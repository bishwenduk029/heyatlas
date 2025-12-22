"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { User, Bot, ArrowDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChatWelcome } from "./chat-welcome";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MessageListProps {
  messages: Message[];
  userImage?: string;
  onQuickAction?: (text: string) => void;
}

export function MessageList({ messages, userImage, onQuickAction }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return scrollTop + clientHeight >= scrollHeight - 100;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("instant"));
    }
  }, [messages, scrollToBottom]);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-4 pb-32">
          {messages.length === 0 ? (
            <ChatWelcome onAction={onQuickAction} />
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "flex items-start gap-3 max-w-[85%]",
                    msg.role === "user" && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0 mt-1 border shadow-sm">
                    {msg.role === "user" ? (
                      <>
                        <AvatarImage src={userImage} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </>
                    ) : (
                      <AvatarFallback className="bg-muted text-primary">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div
                    className={cn(
                      "px-4 py-3 rounded-2xl text-sm shadow-sm border whitespace-pre-wrap",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none border-primary"
                        : "bg-muted/50 text-foreground rounded-tl-none"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      <button
        aria-label="Scroll to bottom"
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted",
          isAtBottom ? "pointer-events-none scale-0 opacity-0" : "pointer-events-auto scale-100 opacity-100"
        )}
        onClick={() => scrollToBottom("smooth")}
        type="button"
      >
        <ArrowDown className="size-4" />
      </button>
    </div>
  );
}
