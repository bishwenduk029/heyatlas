/**
 * AtlasTunnel - WebSocket tunnel to Atlas agent using Cloudflare AgentClient
 *
 * State-based architecture using CF_AGENT_STATE bidirectional sync:
 * - onStateUpdate: Receives agent state including tasks
 * - onNewTask: Callback when a new task is detected for this agent
 * - updateTask(): Updates task via setState (syncs to server)
 * - appendContext(): Appends context via setState (syncs to server)
 */

import { AgentClient } from "agents/client";
import type { StreamEvent } from "../agents/types";

export interface AtlasTunnelOptions {
  host?: string;
  token?: string;
  interactive?: boolean;
}

// Task from Atlas agent state
export interface Task {
  id: string;
  agentId: string;
  description: string; // Brief description of the task
  // Task lifecycle:
  // - new: Fresh task, CLI should pick up and execute
  // - continue: Existing task with new input, CLI should continue execution
  // - in-progress: CLI is currently executing
  // - pending-user-feedback: Completed, waiting for user response
  // - completed: Task fully done
  // - failed: Task failed
  // - paused: Task paused by user
  state:
    | "new"
    | "continue"
    | "in-progress"
    | "pending-user-feedback"
    | "completed"
    | "failed"
    | "paused";
  context: StreamEvent[];
  result?: string;
  summary?: string; // Brief summary for voice feedback
  createdAt: number;
  updatedAt: number;
}

// Agent state from Atlas
export interface AgentState {
  tasks: Record<string, Task>;
  connectedAgentId: string | null;
  interactiveMode: boolean;
  interactiveTaskId: string | null;
  [key: string]: unknown;
}

// Callback for new task detection
export type TaskCallback = (task: Task) => void | Promise<void>;

const DEFAULT_HOST = "agent.heyatlas.app";

export class AtlasTunnel {
  private client: AgentClient<AgentState> | null = null;
  private options: AtlasTunnelOptions;
  private agentId: string = "heyatlas-cli";
  private currentUserId: string | null = null;
  private seenTaskIds = new Set<string>();
  private taskCallback: TaskCallback | null = null;
  private _isConnected = false;
  private currentState: AgentState | null = null;

  constructor(options: AtlasTunnelOptions = {}) {
    this.options = options;
  }

  /**
   * Register callback for new tasks assigned to this agent.
   * In interactive mode: fires for pending/in-progress tasks
   * In non-interactive mode: fires for new pending tasks
   */
  onNewTask(callback: TaskCallback): void {
    this.taskCallback = callback;
  }

  /**
   * Connect to Atlas agent. State updates trigger task detection.
   */
  async connect(userId: string, agentId: string): Promise<void> {
    this.currentUserId = userId;
    this.agentId = agentId;

    const host = DEFAULT_HOST;
    const headers: Record<string, string> = {
      "X-Agent-Id": agentId,
    };
    if (this.options.interactive) {
      headers["X-Interactive-Mode"] = "true";
    }

    return new Promise((resolve, reject) => {
      this.client = new AgentClient<AgentState>({
        agent: "atlas-agent",
        name: userId,
        host,
        options: { headers },
        onStateUpdate: (state, source) => this.handleStateUpdate(state, source),
        ...(this.options.token && { query: { token: this.options.token } }),
      });

      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout - is Atlas running on ${host}?`));
      }, 10000);

      this.client.onopen = () => {
        clearTimeout(timeout);
        this._isConnected = true;
        console.log(`✅ Connected to Atlas agent: ${userId}`);
        resolve();
      };

      this.client.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      this.client.onclose = () => {
        this._isConnected = false;
        console.log(`🔌 Disconnected from Atlas`);
      };
    });
  }

  /**
   * Handle state updates from Atlas agent.
   * Only processes tasks with state "new" or "continue".
   */
  private handleStateUpdate(
    state: AgentState,
    source: "server" | "client",
  ): void {
    // Always store the latest state from server
    if (source === "server") {
      this.currentState = state;
    }

    if (!state.tasks) return;

    for (const task of Object.values(state.tasks)) {
      // Only process tasks with "new" or "continue" state
      if (task.state === "new" || task.state === "continue") {
        this.taskCallback?.(task);
      }
    }
  }

  /**
   * Update task on Atlas server via RPC.
   */
  async updateTask(
    taskId: string,
    update: Partial<Omit<Task, "id" | "createdAt">>,
  ): Promise<void> {
    if (!this.client || !this._isConnected || !this.currentState) {
      throw new Error("Not connected to Atlas");
    }

    const task = this.currentState.tasks?.[taskId];
    if (!task) return;

    const updatedTask: Task = {
      ...task,
      ...update,
      updatedAt: Date.now(),
    };

    try {
      await this.client.call("updateTaskFromClient", [updatedTask]);
      // Update local state optimistically
      this.currentState = {
        ...this.currentState,
        tasks: { ...this.currentState.tasks, [taskId]: updatedTask },
      };
    } catch (error) {
      console.error(`Failed to update task:`, error);
    }
  }

  /**
   * Append context events to a task and sync to server.
   */
  async appendContext(
    taskId: string,
    events: StreamEvent[],
    status?: Task["state"],
  ): Promise<void> {
    if (
      !this.client ||
      !this._isConnected ||
      !this.currentState ||
      events.length === 0
    )
      return;

    const task = this.currentState.tasks?.[taskId];
    if (!task) return;

    const update: Partial<Task> = {
      context: [...(task.context || []), ...events],
    };
    if (status) {
      update.state = status;
    }

    await this.updateTask(taskId, update);
  }

  /**
   * Send voice update to Atlas for voice agent to speak.
   * Called when completion events occur in CLI agents.
   */
  async updateHuman(summary: string): Promise<void> {
    if (!this.client || !this._isConnected) {
      throw new Error("Not connected to Atlas");
    }

    try {
      await this.client.call("update_human", [summary]);
    } catch (error) {
      console.error(`Failed to send voice update:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.currentUserId = null;
    this.seenTaskIds.clear();

    if (this.client) {
      try {
        this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get userId(): string | null {
    return this.currentUserId;
  }

  get interactive(): boolean {
    return this.options.interactive || false;
  }
}
