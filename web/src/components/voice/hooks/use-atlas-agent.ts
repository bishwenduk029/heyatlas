"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { toast } from "sonner";

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
    type: "e2b" | "cloudflare";
    sandboxId: string;
    sessionId?: string;
    vncUrl?: string;
    computerAgentUrl?: string;
    logsUrl?: string;
    agentConnected?: boolean;
  } | null;
  miniComputer?: {
    active: boolean;
    sandboxId?: string;
    vncUrl?: string;
  } | null;
  tier?: string;
  tasks?: Record<string, AtlasTask>;
  activeAgent?: string | null;
  // Note: selectedAgent is a legacy field - we derive it from activeAgent instead
  compressing?: boolean;
}

/** Selected agent type for the UI - null means no agent connected */
export type SelectedAgent = { type: "cloud"; agentId: string } | null;

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
  const [sandboxInfo, setSandboxInfo] = useState<{
    type?: "e2b" | "cloudflare";
    sandboxId?: string;
    sessionId?: string;
    vncUrl?: string;
    logsUrl?: string;
    agentConnected?: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [tasks, setTasks] = useState<AtlasTask[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent>(null);
  const [compressing, setCompressing] = useState(false);
  const [miniComputer, setMiniComputer] = useState<{ active: boolean; sandboxId?: string; vncUrl?: string } | null>(null);
  const [miniComputerConnecting, setMiniComputerConnecting] = useState(false);
  
  // Streaming UI chunks: real-time updates from CLI agent (ephemeral, not stored)
  const [streamingChunks, setStreamingChunks] = useState<Map<string, UIStreamChunk[]>>(new Map());
  const streamingChunksRef = useRef(streamingChunks);

  // All data comes from state updates - single source of truth
  const handleStateUpdate = useCallback((state: AtlasAgentState) => {
    setIsConnected(true);
    if (state.sandbox) {
      setSandboxInfo({
        type: state.sandbox.type,
        sandboxId: state.sandbox.sandboxId,
        sessionId: state.sandbox.sessionId,
        vncUrl: state.sandbox.vncUrl,
        logsUrl: state.sandbox.logsUrl,
        agentConnected: state.sandbox.agentConnected,
      });
    } else if (state.sandbox === null) {
      setSandboxInfo({});
    }

    if (state.tasks) {
      const taskList = Object.values(state.tasks).sort((a, b) => b.updatedAt - a.updatedAt);
      setTasks(taskList);
    }
    if (state.activeAgent !== undefined) {
      setActiveAgent(state.activeAgent || null);
      // Derive selectedAgent from activeAgent - activeAgent is the source of truth
      if (state.activeAgent) {
        setSelectedAgent({ type: "cloud", agentId: state.activeAgent });
      } else {
        setSelectedAgent(null);
      }
    }
    // Ignore state.selectedAgent - it's a legacy field that may have stale data
    if (state.compressing !== undefined) {
      setCompressing(state.compressing);
    }
    // Mini computer state
    if (state.miniComputer !== undefined) {
      setMiniComputer(state.miniComputer);
      setMiniComputerConnecting(false);
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
        
        // Handle workforce events (from agent-smith-py via SSE → CLI → Atlas)
        if (taskEvent.type === "workforce_event" && taskEvent.data) {
          const workforceEvent = taskEvent.data as Record<string, unknown>;
          // Convert to UI chunk format for display
          setStreamingChunks(prev => {
            const newMap = new Map(prev);
            const chunks = newMap.get(taskId) || [];
            const updated = [...chunks, {
              type: "workforce_event",
              ...workforceEvent,
            } as UIStreamChunk].slice(-MAX_UI_CHUNKS_PER_TASK);
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
    onError: (event: Event) => {
      console.error("Atlas Connection Error:", event);
      toast.error("Failed to connect to Atlas agent. Please check your connection.");
    },
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
    onError: (error: Error) => {
      console.error("Agent Chat Error:", error);
      // Avoid duplicate toasts if useAgent already fired one
      if (!error.message.includes("Failed to fetch")) {
        toast.error("Chat error: " + error.message);
      }
    },
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

  // Connect to a cloud agent (creates sandbox)
  const connectCloudAgent = useCallback(async (agentId: string, apiKey?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/agent/connect-cloud", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentId, apiKey }),
      });

      const result = await response.json() as { success: boolean; error?: string };
      
      if (!response.ok) {
        return { success: false, error: result.error || "Failed to connect cloud agent" };
      }
      
      // On successful cloud connection, update selectedAgent state for UI feedback (green dot, etc)
      if (result.success) {
        setSelectedAgent({ type: "cloud", agentId });
      }
      
      return result;
    } catch (error) {
      console.error("Failed to connect cloud agent:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }, []);

  // Disconnect current agent (destroys sandbox, clears state)
  const disconnectAgent = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/agent/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json() as { success: boolean; error?: string };
      
      if (!response.ok) {
        return { success: false, error: result.error || "Failed to disconnect agent" };
      }
      
      // On successful disconnect, clear local state immediately
      if (result.success) {
        setSelectedAgent(null);
      }
      
      return result;
    } catch (error) {
      console.error("Failed to disconnect agent:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }, []);

  // Toggle mini computer (cloud sandbox with browser & tools)
  const toggleMiniComputer = useCallback(async (enabled: boolean): Promise<void> => {
    setMiniComputerConnecting(true);
    try {
      const response = await fetch("/api/agent/mini-computer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Failed to toggle mini computer");
      }
      // State update will come via handleStateUpdate
    } catch (error) {
      console.error("Failed to toggle mini computer:", error);
      setMiniComputerConnecting(false);
      throw error;
    }
  }, []);

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
    activeAgent,
    selectedAgent,
    connectCloudAgent,
    disconnectAgent,
    compressing,
    // Mini computer
    isMiniComputerActive: miniComputer?.active ?? false,
    isMiniComputerConnecting: miniComputerConnecting,
    miniComputerVncUrl: miniComputer?.vncUrl,
    toggleMiniComputer,
  };
}

/**
 * Convert UI stream chunks to UIMessage parts for rendering.
 * Uses AI SDK UI stream protocol types including reasoning, text, and tools.
 * Preserves stream order - parts pushed as they arrive.
 */
function chunksToMessageParts(chunks: UIStreamChunk[]): UIMessagePart[] {
  const parts: UIMessagePart[] = [];
  const toolCalls = new Map<string, { part: UIMessagePart; index: number }>();
  const activeReasoningParts = new Map<string, { part: UIMessagePart; index: number }>();
  let currentTextPart: UIMessagePart | null = null;

  for (const chunk of chunks) {
    switch (chunk.type) {
      case "text-delta": {
        // Append to current text part if it's the last part, otherwise create new
        const delta = (chunk.delta as string) || "";
        if (!delta) break;
        
        if (currentTextPart && parts[parts.length - 1] === currentTextPart) {
          // Continue appending to current text if it's still the last part
          if ("text" in currentTextPart) {
            currentTextPart.text += delta;
          }
        } else {
          // Create new text part (tool/reasoning was inserted between)
          currentTextPart = { type: "text", text: delta } as UIMessagePart;
          parts.push(currentTextPart);
        }
        break;
      }

      case "reasoning-start": {
        currentTextPart = null; // Break text accumulation
        const reasoningPart = {
          type: "reasoning" as const,
          text: "",
          state: "streaming" as const,
        };
        activeReasoningParts.set(chunk.id as string || "default", { part: reasoningPart, index: parts.length });
        parts.push(reasoningPart);
        break;
      }

      case "reasoning-delta":
      case "reasoning": {
        const id = (chunk.id as string) || "default";
        let entry = activeReasoningParts.get(id);
        
        if (!entry) {
          currentTextPart = null;
          const reasoningPart = { type: "reasoning" as const, text: "", state: "streaming" as const };
          entry = { part: reasoningPart, index: parts.length };
          activeReasoningParts.set(id, entry);
          parts.push(reasoningPart);
        }
        
        if ("text" in entry.part) {
          const delta = (chunk.delta as string) || (chunk.text as string) || "";
          entry.part.text += delta;
        }
        break;
      }

      case "reasoning-end": {
        const id = (chunk.id as string) || "default";
        const entry = activeReasoningParts.get(id);
        if (entry) {
          (entry.part as { state: string }).state = "done";
          activeReasoningParts.delete(id);
        }
        break;
      }

      case "tool-input-available": {
        currentTextPart = null; // Break text accumulation
        const input = chunk.input as Record<string, unknown> | undefined;
        const realToolName = (input?.toolName as string) || (chunk.toolName as string);
        const realArgs = (input?.args as Record<string, unknown>) || input || {};
        
        const toolPart = {
          type: "dynamic-tool",
          toolCallId: chunk.toolCallId as string,
          toolName: realToolName,
          state: "input-available" as const,
          input: realArgs,
        } as UIMessagePart;
        
        toolCalls.set(chunk.toolCallId as string, { part: toolPart, index: parts.length });
        parts.push(toolPart);
        break;
      }

      case "tool-output-available": {
        const entry = toolCalls.get(chunk.toolCallId as string);
        if (entry) {
          const updated = {
            ...entry.part,
            state: "output-available" as const,
            output: chunk.output,
          } as UIMessagePart;
          entry.part = updated;
          parts[entry.index] = updated;
        }
        break;
      }

      case "workforce_event": {
        // Pass through workforce events as-is for TaskArtifact to render
        currentTextPart = null;
        parts.push({
          type: "workforce_event",
          event: chunk,
        } as unknown as UIMessagePart);
        break;
      }
    }
  }

  return parts;
}
