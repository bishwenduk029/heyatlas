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
}

export function MessageList({ messages, userImage, onQuickAction, tasks = [], onTaskSelect, compact = false }: MessageListProps) {
  // Create a map of taskId -> task for quick lookup
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  return (
    <Conversation className="w-full h-[calc(100vh-250px)] transition-all duration-300 ease-in-out">
      <ConversationContent className="p-0 mx-auto md:p-6 gap-4 md:gap-6 w-full mx-auto">
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
                    <>
                      <AvatarImage src="/logo.svg" alt="Atlas" />
                      <AvatarFallback className="bg-muted">
                        <Image src="/logo.svg" alt="Atlas" width={16} height={16} />
                      </AvatarFallback>
                    </>
                  )}
                </Avatar>
                <div className="max-w-[85%] flex flex-col gap-2">
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
                  {/* Show task artifact card if message is linked to a task */}
                  {msg.taskId && taskMap.has(msg.taskId) && onTaskSelect && (
                    <TaskArtifactCard
                      task={taskMap.get(msg.taskId)!}
                      onClick={() => onTaskSelect(taskMap.get(msg.taskId)!)}
                    />
                  )}
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
