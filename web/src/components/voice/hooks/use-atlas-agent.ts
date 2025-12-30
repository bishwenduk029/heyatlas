"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import env from "@/env";

/** Maximum ephemeral events to keep per task (prevents memory bloat) */
const MAX_EPHEMERAL_EVENTS_PER_TASK = 50;

/**
 * Task from Atlas agent state.
 * Context contains only message events (type: "message", role: user/assistant).
 */
export interface AtlasTask {
  id: string;
  agentId: string;
  description: string;
  state: "new" | "continue" | "pending" | "in-progress" | "completed" | "failed" | "pending-user-feedback" | "paused";
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

/** Broadcast message for ephemeral task events */
export interface TaskEventBroadcast {
  type: "task_event";
  taskId: string;
  event: StreamEvent;
  timestamp: number;
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
  
  // Ephemeral events: tool calls, thinking, status updates (not stored in task.context)
  const [ephemeralEvents, setEphemeralEvents] = useState<Map<string, StreamEvent[]>>(new Map());
  const ephemeralEventsRef = useRef(ephemeralEvents);

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
      // Debug: log task context lengths
      const taskList = Object.values(state.tasks).sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(taskList);
    }
    if (state.connectedAgentId !== undefined) {
      setConnectedAgentId(state.connectedAgentId || null);
    }
    if (state.compressing !== undefined) {
      setCompressing(state.compressing);
    }
  }, []);

  const handleOpen = useCallback(() => setIsConnected(true), []);
  const handleClose = useCallback(() => setIsConnected(false), []);
  
  // Handle ephemeral task events from broadcast messages
  const handleBroadcastMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "task_event") {
        const { taskId, event: streamEvent } = data as TaskEventBroadcast;
        setEphemeralEvents(prev => {
          const newMap = new Map(prev);
          const events = newMap.get(taskId) || [];
          // Keep last N events per task to prevent memory bloat
          const updated = [...events, streamEvent].slice(-MAX_EPHEMERAL_EVENTS_PER_TASK);
          newMap.set(taskId, updated);
          return newMap;
        });
      }
    } catch {
      // Not JSON or not our message type - ignore
    }
  }, []);

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

  // Listen for broadcast messages (ephemeral task events)
  useEffect(() => {
    if (!agentConnection) {
      return;
    }
    
    const ws = agentConnection as unknown as WebSocket;
    if (ws.addEventListener) {
      ws.addEventListener("message", handleBroadcastMessage);
      return () => {
        ws.removeEventListener("message", handleBroadcastMessage);
      };
    } else {
    }
  }, [agentConnection, handleBroadcastMessage]);
  
  // Keep ref in sync for cleanup
  useEffect(() => {
    ephemeralEventsRef.current = ephemeralEvents;
  }, [ephemeralEvents]);
  
  // Clear ephemeral events when task completes
  useEffect(() => {
    const completedTaskIds = tasks
      .filter(t => t.state === "completed" || t.state === "failed")
      .map(t => t.id);
    
    if (completedTaskIds.length > 0) {
      setEphemeralEvents(prev => {
        const newMap = new Map(prev);
        for (const taskId of completedTaskIds) {
          newMap.delete(taskId);
        }
        return newMap.size !== prev.size ? newMap : prev;
      });
    }
  }, [tasks]);

  // Chat functionality
  const chat = useAgentChat<unknown, UIMessage>({
    agent: agentConnection as ReturnType<typeof useAgent>,
  });

  const isLoading = chat.status === "submitted" || chat.status === "streaming";

  // Return UIMessage directly to preserve parts for ai-elements components
  const messages = chat.messages || [];

  const getTask = useCallback((taskId: string): AtlasTask | undefined => {
    return tasks.find(t => t.id === taskId || t.id.startsWith(taskId));
  }, [tasks]);
  
  const getTaskEphemeralEvents = useCallback((taskId: string): StreamEvent[] => {
    return ephemeralEvents.get(taskId) || [];
  }, [ephemeralEvents]);

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
    getTaskEphemeralEvents,
    ephemeralEvents,
    messages,
    sendMessage: chat.sendMessage,
    clearHistory: chat.clearHistory,
    stop: chat.stop,
    connectedAgentId,
    compressing,
  };
}
