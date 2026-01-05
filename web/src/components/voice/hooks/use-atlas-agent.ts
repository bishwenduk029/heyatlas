"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";

// Type for UIMessage parts array element
type UIMessagePart = UIMessage["parts"][number];
import env from "@/env";

/** Maximum UI stream chunks to keep per task (prevents memory bloat) */
const MAX_UI_CHUNKS_PER_TASK = 100;

/**
 * Task from Atlas agent state.
 * Context contains UIMessage events from CLI agents.
 */
export interface AtlasTask {
  id: string;
  agentId: string;
  description: string;
  state: "new" | "continue" | "pending" | "in-progress" | "completed" | "failed" | "pending-user-feedback" | "paused";
  context: TaskContextEvent[];
  result?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

/** Event stored in task.context */
export interface TaskContextEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Broadcast message for task events */
export interface TaskEventBroadcast {
  type: "task_event";
  taskId: string;
  event: TaskContextEvent;
  timestamp: number;
}

/** UI stream chunk from CLI agent */
export interface UIStreamChunk {
  type: string;
  [key: string]: unknown;
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
  
  // Streaming UI chunks: real-time updates from CLI agent (ephemeral, not stored)
  const [streamingChunks, setStreamingChunks] = useState<Map<string, UIStreamChunk[]>>(new Map());
  const streamingChunksRef = useRef(streamingChunks);

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
  
  // Handle streaming task events from broadcast messages
  const handleBroadcastMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "task_event") {
        const { taskId, event: taskEvent } = data as TaskEventBroadcast;
        
        // Handle UI stream chunks (from CLI agent's toUIMessageStream)
        if (taskEvent.type === "ui_stream_chunk" && taskEvent.data) {
          const chunk = taskEvent.data as UIStreamChunk;
          setStreamingChunks(prev => {
            const newMap = new Map(prev);
            const chunks = newMap.get(taskId) || [];
            // Keep last N chunks per task to prevent memory bloat
            const updated = [...chunks, chunk].slice(-MAX_UI_CHUNKS_PER_TASK);
            newMap.set(taskId, updated);
            return newMap;
          });
        }
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
    streamingChunksRef.current = streamingChunks;
  }, [streamingChunks]);
  
  // Clear streaming chunks when task completes
  useEffect(() => {
    const completedTaskIds = tasks
      .filter(t => t.state === "completed" || t.state === "failed")
      .map(t => t.id);
    
    if (completedTaskIds.length > 0) {
      setStreamingChunks(prev => {
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
  
  // Get streaming UI chunks for a task (real-time updates)
  const getTaskStreamingChunks = useCallback((taskId: string): UIStreamChunk[] => {
    return streamingChunks.get(taskId) || [];
  }, [streamingChunks]);

  // Convert task context + streaming chunks to UIMessage for rendering
  const getTaskUIMessage = useCallback((taskId: string): UIMessage | null => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return null;

    // Get stored UIMessage from context
    const storedMessage = task.context.find(e => e.type === "ui_message");
    const storedParts = (storedMessage?.data?.parts as UIMessagePart[]) || [];

    // Get streaming chunks and convert to parts
    const chunks = streamingChunks.get(taskId) || [];
    const streamingParts = chunksToMessageParts(chunks);

    // Merge: stored parts + streaming parts (streaming shows live progress)
    const allParts = task.state === "in-progress" ? streamingParts : storedParts;

    if (allParts.length === 0) return null;

    return {
      id: `task-${taskId}`,
      role: "assistant",
      parts: allParts,
    };
  }, [tasks, streamingChunks]);

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
    getTaskStreamingChunks,
    getTaskUIMessage,
    messages,
    sendMessage: chat.sendMessage,
    clearHistory: chat.clearHistory,
    stop: chat.stop,
    connectedAgentId,
    compressing,
  };
}

/**
 * Convert UI stream chunks to UIMessage parts for rendering.
 * Uses AI SDK UI stream protocol types (text-delta, tool-input-available, tool-output-available).
 */
function chunksToMessageParts(chunks: UIStreamChunk[]): UIMessagePart[] {
  const parts: UIMessagePart[] = [];
  let accumulatedText = "";
  const toolCalls = new Map<string, UIMessagePart>();

  for (const chunk of chunks) {
    switch (chunk.type) {
      case "text-delta":
        // AI SDK UI stream protocol uses 'delta' property for text-delta
        accumulatedText += (chunk.delta as string) || "";
        break;

      case "tool-input-available":
        // Tool call with complete input ready
        toolCalls.set(chunk.toolCallId as string, {
          type: "dynamic-tool",
          toolCallId: chunk.toolCallId as string,
          toolName: chunk.toolName as string,
          state: "input-available",
          input: chunk.input,
        } as UIMessagePart);
        break;

      case "tool-output-available":
        // Tool result available - update existing tool call
        const existing = toolCalls.get(chunk.toolCallId as string);
        if (existing) {
          toolCalls.set(chunk.toolCallId as string, {
            ...existing,
            state: "output-available",
            output: chunk.output,
          } as UIMessagePart);
        }
        break;
    }
  }

  // Add accumulated text as first part
  if (accumulatedText) {
    parts.push({ type: "text", text: accumulatedText } as UIMessagePart);
  }

  // Add tool calls
  for (const toolPart of toolCalls.values()) {
    parts.push(toolPart);
  }

  return parts;
}
