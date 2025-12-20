"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import type { ReceivedChatMessage } from "@livekit/components-react";
import { ChatEntry } from "@/components/voice/chat-entry";
import { MCPFormEntry } from "@/components/voice/mcp-form-entry";
import { AgentControlBar } from "@/components/voice/agent-control-bar";
import { DesktopViewer } from "@/components/voice/desktop-viewer";
import { Footer } from "@/components/voice/footer";
import useChatAndTranscription from "@/hooks/useChatAndTranscription";
import { Header } from "../homepage/header";
import { RpcError, RpcInvocationData } from "livekit-client";
import { AssistantChat } from "./assistant-chat";

interface SessionViewProps {
  sessionStarted: boolean;
  onStartSession: () => void;
  vncUrl?: string;
  logUrl?: string;
  userId?: string;
  mode?: "local" | "sandbox";
  onToggleChat?: () => void;
  isChatMode?: boolean;
  agentToken?: string;
}

export const SessionView = ({
  sessionStarted,
  onStartSession,
  vncUrl,
  logUrl,
  userId,
  mode = "local",
  onToggleChat,
  isChatMode,
  agentToken,
  ref,
}: React.ComponentProps<"div"> & SessionViewProps) => {
  const room = useRoomContext();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [mcpUIForms, setMCPUIForms] = useState<Array<{
    resource: {
      uri: string;
      mimeType: string;
      text: string;
    };
    timestamp: number;
    submittedValue?: string;
  }>>([]);

  const { state: agentState } = useVoiceAssistant();
  const { messages } = useChatAndTranscription();

  // Auto-scroll to bottom when new messages or forms arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, mcpUIForms]);

  // Clear MCP forms when room disconnects
  useEffect(() => {
    if (!room || room.state === "disconnected") {
      setMCPUIForms([]);
    }
  }, [room?.state, room]);

  // Register RPC handler for displaying MCP UI
  useEffect(() => {
    if (!room?.localParticipant) return;

    const handleDisplayMCPUI = async (data: RpcInvocationData) => {
      try {
        const payload = JSON.parse(data.payload);
        console.log("📥 Received MCP UI RPC call:", payload);

        if (payload.type === "ui_resource" && payload.resource) {
          // Add new form to the chat
          setMCPUIForms(prev => [...prev, {
            resource: payload.resource,
            timestamp: Date.now(),
          }]);

          console.log("✅ UIResource displayed in chat:", payload.resource.uri);
        }

        return JSON.stringify({
          success: true,
          message: "MCP UI displayed"
        });
      } catch (error) {
        console.error("❌ Error handling displayMCPUI RPC:", error);
        throw new RpcError(1, "Failed to display MCP UI");
      }
    };

    room.localParticipant.registerRpcMethod("displayMCPUI", handleDisplayMCPUI);

    return () => {
      room.localParticipant?.unregisterRpcMethod("displayMCPUI");
    };
  }, [room]);

  // Handle MCP form submission
  const handleFormSubmit = async (index: number, value: string) => {
    try {
      // Update form state to show submitted value
      setMCPUIForms(prev => prev.map((form, i) =>
        i === index ? { ...form, submittedValue: value } : form
      ));

      // Send to LiveKit via lk.chat topic
      await room.localParticipant.sendText(value, {
        topic: "lk.chat",
      });

      console.info(`[MCP Form] Submitted form ${index}: "${value}"`);
    } catch (error) {
      console.error("[MCP Form] Failed to submit:", error);
    }
  };

  const handleDisconnect = () => {
    if (room) {
      room.disconnect();
    }
  };

  if (!room) {
    return null;
  }

  const renderChatContent = () => {
    // Combine chat messages and MCP forms into a single timeline
    type ChatItem =
      | { type: 'message'; data: ReceivedChatMessage; timestamp: number }
      | { type: 'form'; data: { form: typeof mcpUIForms[0]; index: number }; timestamp: number };

    const chatItems: ChatItem[] = [
      ...messages.map(msg => ({
        type: 'message' as const,
        data: msg,
        timestamp: msg.timestamp
      })),
      ...mcpUIForms.map((form, index) => ({
        type: 'form' as const,
        data: { form, index },
        timestamp: form.timestamp
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    return (
      <>
        <div className="flex-1 overflow-hidden rounded-lg bg-card shadow-sm">
          <div
            ref={chatScrollRef}
            className="h-full overflow-y-auto p-4"
          >
            <div className="space-y-4">
              {chatItems.map((item) => {
                if (item.type === 'message') {
                  return <ChatEntry hideName key={item.data.id} entry={item.data} />;
                } else {
                  return (
                    <MCPFormEntry
                      key={`mcp-form-${item.data.index}`}
                      resource={item.data.form.resource}
                      timestamp={item.data.form.timestamp}
                      submittedValue={item.data.form.submittedValue}
                      onSubmit={(value) => handleFormSubmit(item.data.index, value)}
                    />
                  );
                }
              })}
            </div>
          </div>
        </div>

        {/* Control Bar - Fixed at bottom of chat column */}
        <div className="mt-3 rounded-lg border bg-card p-4 shadow-sm">
          <AgentControlBar
            onStartSession={onStartSession}
            onDisconnect={handleDisconnect}
            sessionStarted={sessionStarted}
            agentState={room.state === "connected" ? agentState : undefined}
            onToggleChat={onToggleChat}
            isChatMode={false}
          />
        </div>
      </>
    );
  };

  // Local mode: Single centered column (no desktop viewer)
  if (mode === "local") {
    return (
      <div
        ref={ref}
        className="flex-1 flex flex-col"
      >
        {/* Single Centered Column for Local CLI Agent */}
        <div className="flex-1 flex justify-center overflow-hidden px-2 md:px-6 pb-2">
          <div className="flex w-full max-w-2xl flex-col gap-3 h-full">
            {sessionStarted && agentState && agentState !== "idle" && (
              <div className="flex flex-col items-center justify-center py-2 shrink-0">
                <div className="h-4 flex items-center justify-center">
                  <p className="text-xs font-medium text-primary animate-pulse">
                    {agentState === "listening" ? "Listening..." : 
                     agentState === "speaking" ? "Atlas is speaking" : 
                     agentState === "thinking" ? "Thinking..." : ""}
                  </p>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-col">
              {renderChatContent()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sandbox mode: Two column layout with desktop viewer
  return (
    <div
      ref={ref}
      className="flex-1 flex flex-col"
    >
      {/* Main Content Area - Responsive Layout */}
      <div className="flex-1 flex gap-4 overflow-hidden px-2 md:px-6 pb-2">
        {/* Left Column - Chat Messages and Controls (Desktop Only) */}
        <div className="hidden w-2/5 flex-col gap-3 md:flex h-full">
          {isChatMode && agentToken ? (
            <AssistantChat 
              userId={userId || "user"} 
              token={agentToken} 
              onToggleMode={onToggleChat}
            />
          ) : (
            renderChatContent()
          )}
        </div>

        {/* Right/Main Column - Desktop Viewer (Desktop & Mobile) */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm h-full">
          {/* On mobile, pass chat content to be rendered as a tab */}
          <DesktopViewer
            vncUrl={vncUrl}
            logUrl={logUrl}
            userId={userId}
            mobileChatContent={
              <div className="flex h-full flex-col p-2">
                {renderChatContent()}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};
