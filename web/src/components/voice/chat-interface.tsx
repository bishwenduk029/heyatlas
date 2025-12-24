"use client";

import { authClient } from "@/lib/auth/client";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { useState } from "react";
import { TaskList } from "./task-list";
import type { AtlasTask } from "./hooks/use-atlas-agent";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isConnected?: boolean;
  onToggleVoice?: () => void;
  showVoiceToggle?: boolean;
  tasks?: AtlasTask[];
  onTaskSelect?: (task: AtlasTask) => void;
  compact?: boolean;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onStop,
  isLoading = false,
  isConnected = false,
  onToggleVoice,
  showVoiceToggle = false,
  tasks = [],
  onTaskSelect,
  compact = false,
}: ChatInterfaceProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [viewMode, setViewMode] = useState<"chat" | "tasks">("chat");

  const handleSend = async (text: string) => {
    onSendMessage(text);
  };

  return (
    <div className={compact ? "flex flex-col h-full bg-background" : "flex flex-col min-h-screen bg-background"}>
      {/* Content Area */}
      <div className={compact ? "flex-1 flex flex-col w-full overflow-hidden" : "flex-1 flex flex-col w-full pb-32"}>
        <div className={compact ? "flex-1 overflow-auto" : "flex-1"}>
          {viewMode === "chat" ? (
            <MessageList
              messages={messages}
              userImage={user?.image || undefined}
              onQuickAction={isConnected ? handleSend : undefined}
            />
          ) : (
            <TaskList tasks={tasks} onTaskClick={onTaskSelect} />
          )}
        </div>
      </div>

      {/* Input Area - sticky in normal mode, relative in compact mode */}
      <div className={compact 
        ? "shrink-0 bg-background pt-2 pb-4 px-2" 
        : "fixed bottom-0 left-0 right-0 z-10 bg-transparent pt-2 pb-4 pointer-events-none"
      }>
        <div className={compact ? "w-full" : "sticky bottom-0 z-1 mx-auto flex w-full max-w-5xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4 pointer-events-auto my-6"}>
          <ChatInput
            onSend={handleSend}
            onStop={onStop}
            onToggleVoice={onToggleVoice}
            onToggleTasks={() => setViewMode(v => v === "chat" ? "tasks" : "chat")}
            isLoading={isLoading}
            disabled={!isConnected}
            showVoiceToggle={showVoiceToggle}
            isTasksView={viewMode === "tasks"}
          />
        </div>
      </div>
    </div>
  );
}
