"use client";

import { useCallback, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import env from "@/env";

// Agent state synced from atlas backend
export interface AtlasAgentState {
  sandbox?: {
    sandboxId: string;
    vncUrl: string;
    computerAgentUrl: string;
    logsUrl: string;
  } | null;
  tier?: string;
  credentials?: {
    userId: string;
    email?: string;
  } | null;
}

// WebSocket message types from agent
export interface AgentMessage {
  type: string;
  vncUrl?: string;
  logsUrl?: string;
  content?: string;
  source?: string;
  agent?: string;
}

interface UseAtlasAgentOptions {
  userId: string;
  token: string;
  agentUrl?: string;
}

export function useAtlasAgent({ userId, token, agentUrl }: UseAtlasAgentOptions) {
  const [sandboxInfo, setSandboxInfo] = useState<{ vncUrl?: string; logsUrl?: string }>({});
  const [taskUpdate, setTaskUpdate] = useState<{ content: string; agent: string } | null>(null);

  // Handle state updates from agent (sandbox creation, etc.)
  const handleStateUpdate = useCallback((state: AtlasAgentState) => {
    if (state.sandbox) {
      setSandboxInfo({
        vncUrl: state.sandbox.vncUrl,
        logsUrl: state.sandbox.logsUrl,
      });
    }
  }, []);

  // Handle WebSocket messages from agent
  const handleMessage = useCallback((message: MessageEvent) => {
    try {
      const data = JSON.parse(message.data) as AgentMessage;
      
      // Handle sandbox_ready broadcast
      if (data.type === "sandbox_ready" && data.vncUrl) {
        setSandboxInfo({ vncUrl: data.vncUrl, logsUrl: data.logsUrl });
      }
      
      // Handle task updates
      if (data.type === "task-update" && data.content) {
        setTaskUpdate({ content: data.content, agent: data.agent || "agent" });
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, []);

  // Connect to Atlas agent
  const agentConnection = useAgent<AtlasAgentState>({
    agent: "atlas-agent",
    name: userId,
    host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
    query: { token },
    onStateUpdate: handleStateUpdate,
    onMessage: handleMessage,
  });

  // Chat functionality
  const chat = useAgentChat<unknown, UIMessage>({
    agent: agentConnection as ReturnType<typeof useAgent>,
  });

  const isConnected = agentConnection?.readyState === WebSocket.OPEN;
  const isLoading = chat.status === "submitted" || chat.status === "streaming";

  // Helper to extract text from UIMessage
  const getMessageText = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  // Processed messages
  const messages = (chat.messages || [])
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: getMessageText(m),
    }))
    .filter((m) => m.content);

  const dismissTaskUpdate = useCallback(() => setTaskUpdate(null), []);

  return {
    // Connection state
    isConnected,
    isLoading,
    agentConnection,
    
    // Sandbox info (from state sync or broadcast)
    vncUrl: sandboxInfo.vncUrl,
    logsUrl: sandboxInfo.logsUrl,
    
    // Task updates
    taskUpdate,
    dismissTaskUpdate,
    
    // Chat
    messages,
    sendMessage: chat.sendMessage,
    clearHistory: chat.clearHistory,
    stop: chat.stop,
  };
}
