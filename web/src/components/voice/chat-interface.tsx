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
  isVoiceMode?: boolean;
  disabled?: boolean;
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
  isVoiceMode = false,
  disabled = false,
}: ChatInterfaceProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [viewMode, setViewMode] = useState<"chat" | "tasks">("chat");

  const handleSend = async (text: string) => {
    onSendMessage(text);
  };

  return (
    <div className="flex flex-col h-full bg-background w-full">
      <div className="flex-1 min-h-0">
        {viewMode === "chat" ? (
          <MessageList
            messages={messages}
            userImage={user?.image || undefined}
            onQuickAction={isConnected ? handleSend : undefined}
            tasks={tasks}
            onTaskSelect={onTaskSelect}
            compact={compact}
          />
        ) : (
          <div className="h-full w-full overflow-y-auto pt-4">
            <TaskList tasks={tasks} onTaskClick={onTaskSelect} />
          </div>
        )}
      </div>

      <div className="shrink-0 w-full bg-background border-t pt-2 pb-4 px-2">
        <div className="w-full max-w-5xl mx-auto">
          <ChatInput
            onSend={handleSend}
            onStop={onStop}
            onToggleVoice={onToggleVoice}
            onToggleTasks={() => setViewMode(v => v === "chat" ? "tasks" : "chat")}
            isLoading={isLoading}
            disabled={disabled || !isConnected}
            showVoiceToggle={showVoiceToggle}
            isTasksView={viewMode === "tasks"}
            isVoiceMode={isVoiceMode}
          />
        </div>
      </div>
    </div>
  );
}
