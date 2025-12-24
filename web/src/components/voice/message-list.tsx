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
  // Use window scroll instead of container scroll
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, scrollToBottom]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-4">
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
  );
}
