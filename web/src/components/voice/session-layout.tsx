"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  useRoomContext,
  useVoiceAssistant,
  useLocalParticipant,
} from "@livekit/components-react";
import { RpcError, RpcInvocationData, Track } from "livekit-client";
import { AgentControlBar } from "./agent-control-bar";
import { DesktopViewer } from "./desktop-viewer";
import { ChatInterface } from "./chat-interface";
import { TaskList } from "./task-list";
import { TaskArtifact } from "./task-artifact";
import { ChatInput } from "./chat-input";
import useChatAndTranscription from "@/hooks/useChatAndTranscription";
import type { AtlasTask, StreamEvent } from "./hooks/use-atlas-agent";
import type { UIMessage } from "@ai-sdk/react";

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
  messages: UIMessage[];
  onSendMessage: (text: string) => void;
  onStopChat?: () => void;
  isChatLoading?: boolean;
  isChatConnected?: boolean;
  tasks?: AtlasTask[];
  getTaskEphemeralEvents?: (taskId: string) => StreamEvent[];
  connectedAgentId?: string | null;
  compressing?: boolean;
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
  getTaskEphemeralEvents,
  connectedAgentId,
  compressing,
}: SessionLayoutProps) {
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const searchParams = useSearchParams();

  // Get mic enabled state
  const isMicEnabled = useMemo(() => {
    if (!localParticipant) return true;
    const micTrack = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    return micTrack?.isMuted === false;
  }, [localParticipant]);

  // Get media stream for visualizer
  const mediaStream = useMemo(() => {
    if (!localParticipant) return null;
    const micTrack = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    if (!micTrack?.track) return null;

    const mediaStreamTrack = micTrack.track.mediaStreamTrack;
    if (!mediaStreamTrack) return null;

    return new MediaStream([mediaStreamTrack]);
  }, [localParticipant]);

  // Toggle microphone handler
  const handleToggleMute = async () => {
    if (!localParticipant) return;
    await localParticipant.setMicrophoneEnabled(!isMicEnabled);
  };

  // Voice view mode: "voice" or "tasks"
  const [voiceViewMode, setVoiceViewMode] = useState<"voice" | "tasks">(
    "voice",
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [paramsHandled, setParamsHandled] = useState(false);

  // Get live task from tasks array (not a stale snapshot)
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) || null
    : null;

  const { messages: voiceMessages } = useChatAndTranscription();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [mcpForms, setMcpForms] = useState<
    Array<{
      resource: { uri: string; mimeType: string; text: string };
      timestamp: number;
      submittedValue?: string;
    }>
  >([]);

  // Handle URL search params for initial mode
  useEffect(() => {
    if (paramsHandled) return;

    const mode = searchParams.get("mode");

    if (mode === "voice") {
      // Trigger mode toggle to switch from chat to voice
      // This will handle both setting voiceSessionStarted and switching isChatMode
      onToggleMode();
    }

    setParamsHandled(true);
  }, [searchParams, paramsHandled, onToggleMode]);

  // Get initial view mode from URL params
  const initialViewMode =
    (searchParams.get("view") as "chat" | "tasks") || "chat";

  // Auto-scroll voice chat
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
    });
  }, [voiceMessages, mcpForms]);

  // Auto-open artifact when a new task is created (in-progress state)
  useEffect(() => {
    const activeTask = tasks.find(
      (t) => t.state === "in-progress" || t.state === "pending",
    );
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
          setMcpForms((prev) => [
            ...prev,
            { resource: payload.resource, timestamp: Date.now() },
          ]);
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
    setMcpForms((prev) =>
      prev.map((f, i) => (i === index ? { ...f, submittedValue: value } : f)),
    );
    await room.localParticipant.sendText(value, { topic: "lk.chat" });
  };

  // Convert voice messages to chat format (UIMessage with parts)
  const getVoiceMessagesForChat = (): UIMessage[] => {
    return voiceMessages.map((msg) => ({
      id: msg.id,
      role: msg.from?.name === "User" ? "user" : "assistant",
      parts: [{ type: "text" as const, text: msg.message }],
    }));
  };

  // Render the main chat/voice content
  const renderMainContent = (compact = false) => (
    <div className="flex h-full w-full flex-col">
      <ChatInterface
        messages={isChatMode ? messages : getVoiceMessagesForChat()}
        onSendMessage={onSendMessage}
        onStop={onStopChat}
        isLoading={isChatLoading}
        isConnected={isChatMode ? isChatConnected : voiceSessionStarted}
        onToggleVoice={onToggleMode}
        onToggleMute={handleToggleMute}
        showVoiceToggle
        tasks={tasks}
        onTaskSelect={(task) => setSelectedTaskId(task.id)}
        compact={compact}
        isVoiceMode={!isChatMode && voiceSessionStarted}
        isMicEnabled={isMicEnabled}
        agentState={agentState}
        mediaStream={mediaStream}
        disabled={!isChatMode}
        initialViewMode={initialViewMode}
        connectedAgentId={connectedAgentId}
        compressing={compressing}
        selectedTask={!!selectedTask}
      />
    </div>
  );

  // Local mode: split view when task selected
  if (mode === "local") {
    // Split view: chat/voice on left, task viewer on right
    if (selectedTask) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 gap-4 overflow-hidden px-2 pb-2 md:px-6">
            {/* Desktop: Left column - Chat/Voice (narrower) */}
            <div className="hidden h-full w-2/5 flex-col md:flex">
              {renderMainContent(true)}
            </div>

            {/* Desktop: Right column - Task Artifact (wider) */}
            {/* Mobile: Full width Task Artifact with input below */}
            <div className="flex h-full flex-1 flex-col">
              <TaskArtifact
                task={selectedTask}
                ephemeralEvents={getTaskEphemeralEvents?.(selectedTask.id) || []}
                onClose={() => setSelectedTaskId(null)}
              />

              {/* Mobile only: Input at bottom */}
              <div className="mt-3 shrink-0 md:hidden">
                {isChatMode ? (
                  <div className="bg-card rounded-lg border p-2 shadow-sm">
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
                  <div className="bg-card rounded-lg border p-3 shadow-sm">
                    <AgentControlBar
                      onStartSession={onStartVoiceSession}
                      onDisconnect={onDisconnectVoice}
                      sessionStarted={voiceSessionStarted}
                      agentState={
                        room?.state === "connected" ? agentState : undefined
                      }
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 justify-center pb-2">
          <div className="mx-auto h-full w-full px-4">
            {renderMainContent()}
          </div>
        </div>
      </div>
    );
  }

  // Sandbox mode: two columns (chat + desktop viewer)
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 gap-4 overflow-hidden px-2 pb-2 md:px-6">
        {/* Left: Chat (desktop only) */}
        <div className="hidden h-full w-3/5 flex-col gap-3 md:flex">
          <ChatInterface
            messages={isChatMode ? messages : getVoiceMessagesForChat()}
            onSendMessage={onSendMessage}
            onStop={onStopChat}
            isLoading={isChatLoading}
            isConnected={isChatMode ? isChatConnected : voiceSessionStarted}
            onToggleVoice={onToggleMode}
            onToggleMute={handleToggleMute}
            showVoiceToggle
            tasks={tasks}
            isVoiceMode={!isChatMode && voiceSessionStarted}
            isMicEnabled={isMicEnabled}
            agentState={agentState}
            mediaStream={mediaStream}
            disabled={!isChatMode}
            initialViewMode={initialViewMode}
            connectedAgentId={connectedAgentId}
            compressing={compressing}
          />
        </div>

        {/* Right: Desktop Viewer */}
        <div className="bg-card flex h-full flex-1 flex-col overflow-hidden rounded-lg border shadow-sm">
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
                  isConnected={
                    isChatMode ? isChatConnected : voiceSessionStarted
                  }
                  onToggleVoice={onToggleMode}
                  onToggleMute={handleToggleMute}
                  showVoiceToggle
                  tasks={tasks}
                  isVoiceMode={!isChatMode && voiceSessionStarted}
                  isMicEnabled={isMicEnabled}
                  agentState={agentState}
                  mediaStream={mediaStream}
                  disabled={!isChatMode}
                  initialViewMode={initialViewMode}
                  connectedAgentId={connectedAgentId}
                  compressing={compressing}
                />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
