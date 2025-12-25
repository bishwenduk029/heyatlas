"use client";

import { useRef, useEffect, useState } from "react";
import { useRoomContext, useVoiceAssistant } from "@livekit/components-react";
import type { ReceivedChatMessage } from "@livekit/components-react";
import { RpcError, RpcInvocationData } from "livekit-client";
import { ChatEntry } from "./chat-entry";
import { MCPFormEntry } from "./mcp-form-entry";
import { AgentControlBar } from "./agent-control-bar";
import { DesktopViewer } from "./desktop-viewer";
import { ChatInterface } from "./chat-interface";
import { TaskList } from "./task-list";
import { TaskArtifact } from "./task-artifact";
import { ChatInput } from "./chat-input";
import useChatAndTranscription from "@/hooks/useChatAndTranscription";
import type { AtlasTask } from "./hooks/use-atlas-agent";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface SessionLayoutProps {
  mode: "local" | "sandbox";
  isChatMode: boolean;
  voiceSessionStarted: boolean;
  onStartVoiceSession: () => void;
  onToggleMode: () => void;
  onDisconnectVoice: () => void;
  vncUrl?: string;
  logUrl?: string;
  userId?: string;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onStopChat?: () => void;
  isChatLoading?: boolean;
  isChatConnected?: boolean;
  tasks?: AtlasTask[];
}

export function SessionLayout({
  mode,
  isChatMode,
  voiceSessionStarted,
  onStartVoiceSession,
  onToggleMode,
  onDisconnectVoice,
  vncUrl,
  logUrl,
  userId,
  messages,
  onSendMessage,
  onStopChat,
  isChatLoading,
  isChatConnected,
  tasks = [],
}: SessionLayoutProps) {
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();
  
  // Voice view mode: "voice" or "tasks"
  const [voiceViewMode, setVoiceViewMode] = useState<"voice" | "tasks">("voice");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Get live task from tasks array (not a stale snapshot)
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  
  const { messages: voiceMessages } = useChatAndTranscription();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const [mcpForms, setMcpForms] = useState<Array<{
    resource: { uri: string; mimeType: string; text: string };
    timestamp: number;
    submittedValue?: string;
  }>>([]);

  // Auto-scroll voice chat
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [voiceMessages, mcpForms]);

  // Auto-open artifact when a new task is created (in-progress state)
  useEffect(() => {
    const activeTask = tasks.find(t => t.state === "in-progress" || t.state === "pending");
    if (activeTask && !selectedTaskId) {
      setSelectedTaskId(activeTask.id);
    }
  }, [tasks, selectedTaskId]);

  // Clear MCP forms on disconnect
  useEffect(() => {
    if (!room || room.state === "disconnected") setMcpForms([]);
  }, [room?.state, room]);

  // Register MCP UI RPC handler
  useEffect(() => {
    if (!room?.localParticipant) return;

    const handleDisplayMCPUI = async (data: RpcInvocationData) => {
      try {
        const payload = JSON.parse(data.payload);
        if (payload.type === "ui_resource" && payload.resource) {
          setMcpForms((prev) => [...prev, { resource: payload.resource, timestamp: Date.now() }]);
        }
        return JSON.stringify({ success: true });
      } catch {
        throw new RpcError(1, "Failed to display MCP UI");
      }
    };

    room.localParticipant.registerRpcMethod("displayMCPUI", handleDisplayMCPUI);
    return () => room.localParticipant?.unregisterRpcMethod("displayMCPUI");
  }, [room]);

  const handleFormSubmit = async (index: number, value: string) => {
    setMcpForms((prev) => prev.map((f, i) => (i === index ? { ...f, submittedValue: value } : f)));
    await room.localParticipant.sendText(value, { topic: "lk.chat" });
  };

  // Convert voice messages to chat format
  const getVoiceMessagesForChat = (): Message[] => {
    return voiceMessages.map((msg) => ({
      id: msg.id,
      role: msg.from?.identity === "atlas-agent" ? "assistant" : "user",
      content: msg.message,
      timestamp: msg.timestamp,
    }));
  };

  // Render the main chat/voice content
  const renderMainContent = (compact = false) => (
    <div className="flex w-full flex-col gap-3 h-full relative">
      {/* Voice status indicator with animated gradient */}
      {voiceSessionStarted && !isChatMode && !selectedTask && (
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <div 
            className={cn(
              "h-40 w-full transition-all duration-500",
              agentState && "animate-pulse"
            )}
            style={{
              background: agentState === "listening" 
                ? "radial-gradient(ellipse 100% 100% at 50% 0%, rgba(59, 130, 246, 0.2) 0%, rgba(6, 182, 212, 0.1) 25%, rgba(6, 182, 212, 0.05) 50%, transparent 80%)"
                : agentState === "speaking"
                ? "radial-gradient(ellipse 100% 100% at 50% 0%, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.1) 25%, rgba(16, 185, 129, 0.05) 50%, transparent 80%)"
                : agentState === "thinking"
                ? "radial-gradient(ellipse 100% 100% at 50% 0%, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.1) 25%, rgba(236, 72, 153, 0.05) 50%, transparent 80%)"
                : "radial-gradient(ellipse 100% 100% at 50% 0%, rgba(156, 163, 175, 0.15) 0%, rgba(156, 163, 175, 0.08) 25%, rgba(156, 163, 175, 0.03) 50%, transparent 80%)"
            }}
          />
          <div className="flex flex-col items-center -mt-28 pointer-events-auto">
            <div className="px-4 py-2 bg-background/70 backdrop-blur-md rounded-full border border-border/50 shadow-lg">
              <p className={cn(
                "text-xs font-medium",
                agentState ? "text-primary" : "text-muted-foreground animate-pulse"
              )}>
                {agentState === "listening" ? "🎤 Listening..." : 
                 agentState === "speaking" ? "🔊 Atlas is speaking" : 
                 agentState === "thinking" ? "💭 Thinking..." : 
                 "🔄 Connecting..."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <ChatInterface
          messages={isChatMode ? messages : getVoiceMessagesForChat()}
          onSendMessage={onSendMessage}
          onStop={onStopChat}
          isLoading={isChatLoading}
          isConnected={isChatMode ? isChatConnected : voiceSessionStarted}
          onToggleVoice={onToggleMode}
          showVoiceToggle
          tasks={tasks}
          onTaskSelect={(task) => setSelectedTaskId(task.id)}
          compact={compact}
          isVoiceMode={!isChatMode && voiceSessionStarted}
          disabled={!isChatMode}
        />
      </div>
    </div>
  );

  // Local mode: split view when task selected
  if (mode === "local") {
    // Split view: chat/voice on left, task viewer on right
    if (selectedTask) {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex gap-4 overflow-hidden px-2 md:px-6 pb-2">
            {/* Desktop: Left column - Chat/Voice (narrower) */}
            <div className="hidden md:flex w-2/5 flex-col h-full">
              {renderMainContent(true)}
            </div>
            
            {/* Desktop: Right column - Task Artifact (wider) */}
            {/* Mobile: Full width Task Artifact with input below */}
            <div className="flex flex-1 flex-col h-full">
              <TaskArtifact
                task={selectedTask}
                onClose={() => setSelectedTaskId(null)}
              />
              
              {/* Mobile only: Input at bottom */}
              <div className="md:hidden mt-3 shrink-0">
                {isChatMode ? (
                  <div className="rounded-lg border bg-card p-2 shadow-sm">
                    <ChatInput
                      onSend={onSendMessage}
                      onStop={onStopChat}
                      onToggleVoice={onToggleMode}
                      onToggleTasks={() => setSelectedTaskId(null)}
                      isLoading={isChatLoading}
                      disabled={!isChatConnected}
                      showVoiceToggle
                      isTasksView={true}
                      isVoiceMode={false}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <AgentControlBar
                      onStartSession={onStartVoiceSession}
                      onDisconnect={onDisconnectVoice}
                      sessionStarted={voiceSessionStarted}
                      agentState={room?.state === "connected" ? agentState : undefined}
                      onToggleChat={onToggleMode}
                      isChatMode={false}
                      onToggleTasks={() => setSelectedTaskId(null)}
                      isTasksMode={true}
                      taskCount={tasks.length}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Single column (no task selected)
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex justify-center pb-2">
          <div className="w-full max-w-5xl mx-auto px-4 h-full">
            {renderMainContent()}
          </div>
        </div>
      </div>
    );
  }

  // Sandbox mode: two columns (chat + desktop viewer)
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex gap-4 overflow-hidden px-2 md:px-6 pb-2">
        {/* Left: Chat (desktop only) */}
        <div className="hidden md:flex w-3/5 flex-col gap-3 h-full">
          <ChatInterface
            messages={isChatMode ? messages : getVoiceMessagesForChat()}
            onSendMessage={onSendMessage}
            onStop={onStopChat}
            isLoading={isChatLoading}
            isConnected={isChatMode ? isChatConnected : voiceSessionStarted}
            onToggleVoice={onToggleMode}
            showVoiceToggle
            tasks={tasks}
            isVoiceMode={!isChatMode && voiceSessionStarted}
            disabled={!isChatMode}
          />
        </div>

        {/* Right: Desktop Viewer */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm h-full">
          <DesktopViewer
            vncUrl={vncUrl}
            logUrl={logUrl}
            userId={userId}
            mobileChatContent={
              <div className="flex h-full flex-col p-2">
                <ChatInterface
                  messages={isChatMode ? messages : getVoiceMessagesForChat()}
                  onSendMessage={onSendMessage}
                  onStop={onStopChat}
                  isLoading={isChatLoading}
                  isConnected={isChatMode ? isChatConnected : voiceSessionStarted}
                  onToggleVoice={onToggleMode}
                  showVoiceToggle
                  tasks={tasks}
                  isVoiceMode={!isChatMode && voiceSessionStarted}
                  disabled={!isChatMode}
                />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
