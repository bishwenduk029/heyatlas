"use client";

import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChatWelcome } from "./chat-welcome";
import { TaskArtifactCard } from "./task-artifact-card";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import type { AtlasTask } from "./hooks/use-atlas-agent";
import Image from "next/image";
import { useEffect, useRef } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  taskId?: string; // Optional: link message to a task
}

interface MessageListProps {
  messages: Message[];
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
  // Create a map of taskId -> task for quick lookup
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  
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
            {messages.map((msg, index) => (
              <div
                key={msg.id}
                className="flex items-start gap-4 p-4 border-b border-border/10 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <Avatar 
                  className={cn(
                    "h-10 w-10 shrink-0 shadow-sm",
                    msg.role === "user" 
                      ? "bg-[#5865f2]" 
                      : "bg-[#23a55a]"
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
                    <>
                      <AvatarImage src="/logo.svg" alt="Atlas" />
                      <AvatarFallback className="bg-muted">
                        <Image
                          src="/logo.svg"
                          alt="Atlas"
                          width={20}
                          height={20}
                        />
                      </AvatarFallback>
                    </>
                  )}
                </Avatar>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span 
                      className={cn(
                        "text-sm font-bold",
                        msg.role === "user" 
                          ? "text-[#5865f2]" 
                          : "text-[#23a55a]"
                      )}
                    >
                      {msg.role === "user" ? "You" : "Atlas"}
                    </span>
                    <span className="text-[10px] text-muted-foreground opacity-50 uppercase tracking-tighter">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {msg.content.trim()}
                  </div>
                  {/* Show task artifact card if message is linked to a task */}
                  {msg.taskId &&
                    taskMap.has(msg.taskId) &&
                    onTaskSelect &&
                    (() => {
                      const task = taskMap.get(msg.taskId);
                      if (!task) return null;
                      return (
                        <TaskArtifactCard
                          task={task}
                          onClick={() => onTaskSelect(task)}
                        />
                      );
                    })()}
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
