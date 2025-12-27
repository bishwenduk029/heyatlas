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
  initialViewMode?: "chat" | "tasks";
  connectedAgentId?: string | null;
  compressing?: boolean;
  selectedTask?: boolean;
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
  initialViewMode = "chat",
  connectedAgentId,
  compressing,
  selectedTask = false,
}: ChatInterfaceProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [viewMode, setViewMode] = useState<"chat" | "tasks">(initialViewMode);

  const handleSend = async (text: string) => {
    onSendMessage(text);
  };

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">
        {viewMode === "chat" ? (
          <MessageList
            messages={messages}
            userImage={user?.image || undefined}
            onQuickAction={isConnected ? handleSend : undefined}
            tasks={tasks}
            onTaskSelect={onTaskSelect}
            compact={compact}
            selectedTask={selectedTask}
          />
        ) : (
          <div className="h-full w-full overflow-y-auto pt-4">
            <TaskList tasks={tasks} onTaskClick={onTaskSelect} />
          </div>
        )}
      </div>

      <div className="bg-background w-full shrink-0">
        <div className={selectedTask ? "w-full" : "mx-auto md:w-1/2"}>
          <ChatInput
            onSend={handleSend}
            onStop={onStop}
            onToggleVoice={onToggleVoice}
            onToggleTasks={() =>
              setViewMode((v) => (v === "chat" ? "tasks" : "chat"))
            }
            isLoading={isLoading}
            disabled={disabled || !isConnected}
            showVoiceToggle={showVoiceToggle}
            isTasksView={viewMode === "tasks"}
            isVoiceMode={isVoiceMode}
            connectedAgentId={connectedAgentId}
            compressing={compressing}
          />
        </div>
      </div>
    </div>
  );
}
