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
import { TaskViewer } from "./task-viewer";
import { ChatInput } from "./chat-input";
import useChatAndTranscription from "@/hooks/useChatAndTranscription";
import type { AtlasTask } from "./hooks/use-atlas-agent";

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

  // Voice chat content (messages + MCP forms timeline)
  const renderVoiceChat = (compact = false) => {
    type ChatItem =
      | { type: "message"; data: ReceivedChatMessage; timestamp: number }
      | { type: "form"; data: { form: (typeof mcpForms)[0]; index: number }; timestamp: number };

    const items: ChatItem[] = [
      ...voiceMessages.map((msg) => ({ type: "message" as const, data: msg, timestamp: msg.timestamp })),
      ...mcpForms.map((form, index) => ({ type: "form" as const, data: { form, index }, timestamp: form.timestamp })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    const toggleTasksView = () => setVoiceViewMode(voiceViewMode === "tasks" ? "voice" : "tasks");

    return (
      <div className={compact ? "flex flex-col h-full" : "contents"}>
        <div className={compact ? "flex-1 overflow-hidden rounded-lg bg-card shadow-sm" : "flex-1 overflow-hidden rounded-lg bg-card shadow-sm"}>
          {voiceViewMode === "tasks" ? (
            <TaskList
              tasks={tasks}
              onTaskClick={(task) => setSelectedTaskId(task.id)}
            />
          ) : (
            <div ref={chatScrollRef} className="h-full overflow-y-auto">
              <div className="space-y-4">
                {items.map((item) =>
                  item.type === "message" ? (
                    <ChatEntry hideName key={item.data.id} entry={item.data} />
                  ) : (
                    <MCPFormEntry
                      key={`mcp-form-${item.data.index}`}
                      resource={item.data.form.resource}
                      timestamp={item.data.form.timestamp}
                      submittedValue={item.data.form.submittedValue}
                      onSubmit={(value) => handleFormSubmit(item.data.index, value)}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Voice Control Bar */}
        <div className={compact ? "mt-3 rounded-lg border bg-card p-3 shadow-sm shrink-0" : "mt-3 rounded-lg border bg-card p-4 shadow-sm"}>
          <AgentControlBar
            onStartSession={onStartVoiceSession}
            onDisconnect={onDisconnectVoice}
            sessionStarted={voiceSessionStarted}
            agentState={room?.state === "connected" ? agentState : undefined}
            onToggleChat={onToggleMode}
            isChatMode={false}
            onToggleTasks={toggleTasksView}
            isTasksMode={voiceViewMode === "tasks"}
            taskCount={tasks.length}
          />
        </div>
      </div>
    );
  };

  // Render the main chat/voice content
  const renderMainContent = (compact = false) => (
    <div className="flex w-full flex-col gap-3 h-full">
      {/* Voice status indicator */}
      {voiceSessionStarted && agentState && !isChatMode && !selectedTask && (
        <div className="flex flex-col items-center py-2 shrink-0">
          <p className="text-xs font-medium text-primary animate-pulse">
            {agentState === "listening" ? "Listening..." : 
             agentState === "speaking" ? "Atlas is speaking" : 
             agentState === "thinking" ? "Thinking..." : ""}
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0">
        {isChatMode ? (
          <ChatInterface
            messages={messages}
            onSendMessage={onSendMessage}
            onStop={onStopChat}
            isLoading={isChatLoading}
            isConnected={isChatConnected}
            onToggleVoice={onToggleMode}
            showVoiceToggle
            tasks={tasks}
            onTaskSelect={(task) => setSelectedTaskId(task.id)}
            compact={compact}
          />
        ) : (
          renderVoiceChat(compact)
        )}
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
            
            {/* Desktop: Right column - Task Viewer (wider) */}
            {/* Mobile: Full width Task Viewer with input below */}
            <div className="flex flex-1 flex-col h-full">
              <TaskViewer
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
          <div className="w-full max-w-5xl mx-auto px-4">
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
          {isChatMode ? (
            <ChatInterface
              messages={messages}
              onSendMessage={onSendMessage}
              onStop={onStopChat}
              isLoading={isChatLoading}
              isConnected={isChatConnected}
              onToggleVoice={onToggleMode}
              showVoiceToggle
              tasks={tasks}
            />
          ) : (
            renderVoiceChat()
          )}
        </div>

        {/* Right: Desktop Viewer */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm h-full">
          <DesktopViewer
            vncUrl={vncUrl}
            logUrl={logUrl}
            userId={userId}
            mobileChatContent={
              <div className="flex h-full flex-col p-2">
                {isChatMode ? (
                  <ChatInterface
                    messages={messages}
                    onSendMessage={onSendMessage}
                    onStop={onStopChat}
                    isLoading={isChatLoading}
                    isConnected={isChatConnected}
                    tasks={tasks}
                  />
                ) : (
                  renderVoiceChat()
                )}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
