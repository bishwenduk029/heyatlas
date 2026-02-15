"use client";

import { authClient } from "@/lib/auth/client";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { AnimatedHeroTitle } from "@/components/homepage/animated-hero-title";
import { useState } from "react";
import { TaskList } from "./task-list";
import type { AtlasTask, SelectedAgent } from "./hooks/use-atlas-agent";
import type { UIMessage } from "@ai-sdk/react";
import type { FileUIPart } from "ai";

interface ChatInterfaceProps {
  messages: UIMessage[];
  onSendMessage: (text: string, files?: FileUIPart[]) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isConnected?: boolean;
  onToggleVoice?: () => void;
  onToggleMute?: () => void;
  showVoiceToggle?: boolean;
  tasks?: AtlasTask[];
  onTaskSelect?: (task: AtlasTask) => void;
  compact?: boolean;
  isVoiceMode?: boolean;
  isMicEnabled?: boolean;
  agentState?: string;
  mediaStream?: MediaStream | null;
  disabled?: boolean;
  initialViewMode?: "chat" | "tasks";
  activeAgent?: string | null;
  compressing?: boolean;
  tokensUsed?: number;
  selectedTask?: boolean;
  selectedAgent?: SelectedAgent | null;
  onDisconnectAgent?: () => Promise<{ success: boolean; error?: string }>;
  onConnectCloudAgent?: (
    agentId: string,
    apiKey?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  // Mini Computer
  isMiniComputerActive?: boolean;
  isMiniComputerConnecting?: boolean;
  onToggleMiniComputer?: (enabled: boolean) => Promise<void>;
  // Desktop app local agent
  isLocalAgentRunning?: boolean;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onStop,
  isLoading = false,
  isConnected = false,
  onToggleVoice,
  onToggleMute,
  showVoiceToggle = false,
  tasks = [],
  onTaskSelect,
  compact = false,
  isVoiceMode = false,
  isMicEnabled = true,
  agentState,
  mediaStream,
  disabled = false,
  initialViewMode = "chat",
  activeAgent,
  compressing,
  tokensUsed,
  selectedTask = false,
  selectedAgent,
  onDisconnectAgent,
  onConnectCloudAgent,
  isMiniComputerActive,
  isMiniComputerConnecting,
  onToggleMiniComputer,
  isLocalAgentRunning,
}: ChatInterfaceProps) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [viewMode, setViewMode] = useState<"chat" | "tasks">(initialViewMode);

  const handleSend = async (text: string, files?: FileUIPart[]) => {
    onSendMessage(text, files);
  };

  const hasMessages = messages.length > 0;
  const inputContainerClass =
    selectedTask || isMiniComputerActive ? "w-full" : "mx-auto md:w-1/2";

  return (
    <div className="bg-background relative flex h-full w-full flex-col">
      {hasMessages ? (
        <>
          {viewMode === "chat" ? (
            <MessageList
              messages={messages}
              userImage={user?.image || undefined}
              onQuickAction={isConnected ? handleSend : undefined}
              tasks={tasks}
              onTaskSelect={onTaskSelect}
              compact={compact}
              selectedTask={selectedTask}
              fullWidth={isMiniComputerActive}
            />
          ) : (
            <TaskList tasks={tasks} onTaskClick={onTaskSelect} />
          )}

          <div className="bg-background w-full shrink-0 border-t pt-2">
            <div className={inputContainerClass}>
              <ChatInput
                onSend={handleSend}
                onStop={onStop}
                onToggleVoice={onToggleVoice}
                onToggleMute={onToggleMute}
                onToggleTasks={() =>
                  setViewMode((v) => (v === "chat" ? "tasks" : "chat"))
                }
                isLoading={isLoading}
                disabled={disabled || !isConnected}
                showVoiceToggle={showVoiceToggle}
                isTasksView={viewMode === "tasks"}
                isVoiceMode={isVoiceMode}
                isMicEnabled={isMicEnabled}
                agentState={agentState}
                mediaStream={mediaStream}
                activeAgent={activeAgent}
                compressing={compressing}
                tokensUsed={tokensUsed}
                selectedAgent={selectedAgent}
                onDisconnectAgent={onDisconnectAgent}
                onConnectCloudAgent={onConnectCloudAgent}
                isMiniComputerActive={isMiniComputerActive}
                isMiniComputerConnecting={isMiniComputerConnecting}
                onToggleMiniComputer={onToggleMiniComputer}
                isLocalAgentRunning={isLocalAgentRunning}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="flex w-full flex-col items-center space-y-8">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <AnimatedHeroTitle />
              <p className="text-muted-foreground mx-auto text-xl leading-relaxed">
                Your personal AI companion who{" "}
                <span className="text-primary font-semibold">Thinks</span>,{" "}
                <span className="text-primary font-semibold">Listens</span>, and{" "}
                <span className="text-primary font-semibold">Acts</span>.
              </p>
            </div>
            <div className={`w-full ${inputContainerClass}`}>
              <ChatInput
                onSend={handleSend}
                onStop={onStop}
                onToggleVoice={onToggleVoice}
                onToggleMute={onToggleMute}
                onToggleTasks={() =>
                  setViewMode((v) => (v === "chat" ? "tasks" : "chat"))
                }
                isLoading={isLoading}
                disabled={disabled || !isConnected}
                showVoiceToggle={showVoiceToggle}
                isTasksView={viewMode === "tasks"}
                isVoiceMode={isVoiceMode}
                isMicEnabled={isMicEnabled}
                agentState={agentState}
                mediaStream={mediaStream}
                activeAgent={activeAgent}
                compressing={compressing}
                tokensUsed={tokensUsed}
                selectedAgent={selectedAgent}
                onDisconnectAgent={onDisconnectAgent}
                onConnectCloudAgent={onConnectCloudAgent}
                isMiniComputerActive={isMiniComputerActive}
                isMiniComputerConnecting={isMiniComputerConnecting}
                onToggleMiniComputer={onToggleMiniComputer}
                isLocalAgentRunning={isLocalAgentRunning}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
