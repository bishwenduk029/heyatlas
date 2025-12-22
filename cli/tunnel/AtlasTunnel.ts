/**
 * AtlasTunnel - WebSocket tunnel to Atlas agent using Cloudflare AgentClient
 *
 * Connects to Atlas Durable Object and provides:
 * - sub(): Subscribe to incoming task messages
 * - pub(): Publish task responses back to Atlas
 */

import {
  TunnelInterface,
  type ConnectOptions,
  type SendMessageOptions,
} from "./TunnelInterface";

import { AgentClient } from "agents/client";

export interface AtlasTunnelOptions {
  host?: string;
  token?: string;
}

const DEFAULT_HOST = "localhost:8787";

export class AtlasTunnel extends TunnelInterface {
  private client: AgentClient | null = null;
  private options: AtlasTunnelOptions;
  private currentUserId: string | null = null;

  constructor(options: AtlasTunnelOptions = {}) {
    super();
    this.options = options;
  }

  setToken(token: string): void {
    this.options.token = token;
  }

  setHost(host: string): void {
    this.options.host = host;
  }

  /**
   * Connect to Atlas agent by user ID using AgentClient.
   */
  async connectToRoom(
    userId: string,
    options: ConnectOptions = {}
  ): Promise<void> {
    this.currentUserId = userId;
    return this.connect(userId, options);
  }

  async connect(userId: string, options: ConnectOptions = {}): Promise<void> {
    try {
      this._agentId = options.agentId || this._agentId;
      const host = this.options.host || DEFAULT_HOST;

      // Use AgentClient from Cloudflare agents SDK
      this.client = new AgentClient({
        agent: "atlas-agent",
        name: userId,
        host,
        ...(this.options.token && { query: { token: this.options.token } }),
      });

      await new Promise<void>((resolve, reject) => {
        if (!this.client) return reject(new Error("Client not created"));

        this.client.onopen = () => {
          this._isConnected = true;
          resolve();
        };

        this.client.onerror = (error) => {
          reject(error);
        };

        this.client.onclose = () => this.handleClose();
        this.client.onmessage = (event) => this.handleMessage(event);
      });
    } catch (error) {
      this._isConnected = false;
      throw error;
    }
  }

  /**
   * Publish a task response back to Atlas.
   */
  async pub(
    message: string,
    options: SendMessageOptions = {}
  ): Promise<boolean> {
    if (!this.client || !this._isConnected) {
      return false;
    }

    const payload = {
      type: "task-response",
      content: message,
      status: options.status || "completed",
      agent: options.agent || this._agentId,
      source: "cli",
    };

    try {
      this.client.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Publish a raw payload to Atlas.
   */
  async publish(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.client || !this._isConnected) {
      return false;
    }

    try {
      this.client.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.currentUserId = null;

    if (this.client) {
      try {
        this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  get userId(): string | null {
    return this.currentUserId;
  }

  private handleClose(): void {
    this._isConnected = false;
  }

  /**
   * Handle incoming messages from Atlas.
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      const data = JSON.parse(event.data.toString());
      const msgType = data.type;

      // Handle task messages from Atlas
      if (msgType === "task" || msgType === "tasks") {
        const content = data.content || data.task || "";
        if (content && this._callback) {
          await Promise.resolve(this._callback(content, data));
        }
      }

      // Handle other message types
      if (msgType === "connected") {
        console.log(`✅ Connected to Atlas agent: ${data.userId || "unknown"}`);
      }

      if (msgType === "error") {
        console.error(`❌ Atlas error: ${data.message || "Unknown error"}`);
      }
    } catch {
      // Silently ignore parse errors
    }
  }
}
