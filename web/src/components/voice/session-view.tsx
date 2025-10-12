"use client";

import React, { useRef, useEffect } from "react";
import Link from "next/link";
import {
  type ReceivedChatMessage,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ChatEntry } from "@/components/voice/chat-entry";
import { AgentControlBar } from "@/components/voice/agent-control-bar";
import { DesktopViewer } from "@/components/voice/desktop-viewer";
import { Footer } from "@/components/voice/footer";
import useChatAndTranscription from "@/hooks/useChatAndTranscription";
import { Header } from "../homepage/header";

interface SessionViewProps {
  sessionStarted: boolean;
  onStartSession: () => void;
  vncUrl?: string;
  logUrl?: string;
}

export const SessionView = ({
  sessionStarted,
  onStartSession,
  vncUrl,
  logUrl,
  ref,
}: React.ComponentProps<"div"> & SessionViewProps) => {
  const room = useRoomContext();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const { state: agentState } = useVoiceAssistant();
  const { messages } = useChatAndTranscription();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleDisconnect = () => {
    if (room) {
      room.disconnect();
    }
  };
  
  if (!room) {
    return null;
  }

  const renderChatContent = () => (
    <>
      <div className="flex-1 overflow-hidden rounded-lg border bg-card shadow-sm h-full">
        <div
          ref={chatScrollRef}
          className="h-full overflow-y-auto p-4"
        >
          <div className="space-y-4">
            {messages.map((message: ReceivedChatMessage) => (
              <ChatEntry hideName key={message.id} entry={message} />
            ))}
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
        />
      </div>
    </>
  );

  return (
    <div
      ref={ref}
      className="flex h-screen flex-col"
    >
      {/* App Header */}
      <Header />

      {/* Main Content Area - Responsive Layout */}
      <div className="flex flex-1 gap-4 overflow-hidden px-2 md:px-6 pb-2">
        {/* Left Column - Chat Messages and Controls (Desktop Only) */}
        <div className="hidden w-2/5 flex-col gap-3 md:flex h-full">
          {renderChatContent()}
        </div>

        {/* Right/Main Column - Desktop Viewer (Desktop & Mobile) */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm h-full">
          {/* On mobile, pass chat content to be rendered as a tab */}
          <DesktopViewer 
            vncUrl={vncUrl} 
            logUrl={logUrl} 
            mobileChatContent={
              <div className="flex h-full flex-col p-2">
                {renderChatContent()}
              </div>
            } 
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6">
        <Footer />
      </div>
    </div>
  );
};
