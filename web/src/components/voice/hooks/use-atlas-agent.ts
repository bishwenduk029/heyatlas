"use client";

import { useCallback, useState, useMemo } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import env from "@/env";

/**
 * Task from Atlas agent state.
 * Context contains only message events (type: "message", role: user/assistant).
 */
export interface AtlasTask {
  id: string;
  agentId: string;
  description: string;
  state: "pending" | "in-progress" | "completed" | "failed" | "pending-user-feedback";
  context: StreamEvent[];
  result?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

/** Event stored in task.context (only "message" events with role user/assistant are stored) */
export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Agent state synced from Atlas via CF_AGENT_STATE */
export interface AtlasAgentState {
  sandbox?: {
    sandboxId: string;
    vncUrl: string;
    computerAgentUrl: string;
    logsUrl: string;
  } | null;
  tier?: string;
  tasks?: Record<string, AtlasTask>;
  connectedAgentId?: string | null;
  compressing?: boolean;
}

interface UseAtlasAgentOptions {
  userId: string;
  token: string;
  agentUrl?: string;
}

/**
 * Hook for connecting to Atlas agent.
 * All state (tasks, sandbox, etc.) is synced automatically via onStateUpdate.
 */
export function useAtlasAgent({ userId, token, agentUrl }: UseAtlasAgentOptions) {
  const [sandboxInfo, setSandboxInfo] = useState<{ vncUrl?: string; logsUrl?: string }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [tasks, setTasks] = useState<AtlasTask[]>([]);
  const [connectedAgentId, setConnectedAgentId] = useState<string | null>("Droid"); // TODO: Remove default for prod
  const [compressing, setCompressing] = useState(false);

  // All data comes from state updates - single source of truth
  const handleStateUpdate = useCallback((state: AtlasAgentState) => {
    setIsConnected(true);
    if (state.sandbox) {
      setSandboxInfo({
        vncUrl: state.sandbox.vncUrl,
        logsUrl: state.sandbox.logsUrl,
      });
    }
    if (state.tasks) {
      const taskList = Object.values(state.tasks).sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(taskList);
    }
    if (state.connectedAgentId !== undefined) {
      console.log("[Atlas Agent] connectedAgentId updated:", state.connectedAgentId);
      setConnectedAgentId(state.connectedAgentId || null);
    }
    if (state.compressing !== undefined) {
      setCompressing(state.compressing);
    }
  }, []);

  const handleOpen = useCallback(() => setIsConnected(true), []);
  const handleClose = useCallback(() => setIsConnected(false), []);

  // Connect to Atlas agent - state sync handles everything
  const agentConnection = useAgent<AtlasAgentState>({
    agent: "atlas-agent",
    name: userId,
    host: agentUrl || env.NEXT_PUBLIC_ATLAS_AGENT_URL,
    query: { token },
    onStateUpdate: handleStateUpdate,
    onOpen: handleOpen,
    onClose: handleClose,
  });

  // Chat functionality
  const chat = useAgentChat<unknown, UIMessage>({
    agent: agentConnection as ReturnType<typeof useAgent>,
  });

  const isLoading = chat.status === "submitted" || chat.status === "streaming";

  const getMessageText = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  const messages = (chat.messages || [])
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: getMessageText(m),
    }))
    .filter((m) => m.content);

  const getTask = useCallback((taskId: string): AtlasTask | undefined => {
    return tasks.find(t => t.id === taskId || t.id.startsWith(taskId));
  }, [tasks]);

  const activeTasks = useMemo(() => 
    tasks.filter(t => t.state === "in-progress" || t.state === "pending"),
    [tasks]
  );

  return {
    isConnected,
    isLoading,
    agentConnection,
    vncUrl: sandboxInfo.vncUrl,
    logsUrl: sandboxInfo.logsUrl,
    tasks,
    activeTasks,
    getTask,
    messages,
    sendMessage: chat.sendMessage,
    clearHistory: chat.clearHistory,
    stop: chat.stop,
    connectedAgentId,
    compressing,
  };
}
