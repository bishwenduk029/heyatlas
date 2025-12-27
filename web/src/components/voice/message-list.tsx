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

  return (
    <Conversation className="my-2 h-[calc(100vh-250px)] w-full transition-all duration-300 ease-in-out">
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
                className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "flex max-w-[85%] items-start gap-3",
                    msg.role === "user" && "flex-row-reverse",
                  )}
                >
                  <Avatar className="mt-1 h-8 w-8 shrink-0 border shadow-sm">
                    {msg.role === "user" ? (
                      <>
                        <AvatarImage src={userImage} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </>
                    ) : (
                      <>
                        <AvatarImage src="/logo.svg" alt="Atlas" />
                        <AvatarFallback className="bg-muted">
                          <Image
                            src="/logo.svg"
                            alt="Atlas"
                            width={16}
                            height={16}
                          />
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  <div className="flex max-w-[85%] flex-col gap-2">
                    <div
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap shadow-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground border-primary rounded-tr-none"
                          : "bg-muted/50 text-foreground rounded-tl-none",
                      )}
                    >
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
              </div>
            ))}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
