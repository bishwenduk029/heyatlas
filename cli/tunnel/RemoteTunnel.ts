/**
 * RemoteTunnel - Pub/Sub tunnel for remote agent communication.
 *
 * Connects to a relay server and provides:
 * - pub(): Publish messages to the tunnel
 * - sub(): Subscribe to incoming messages with a callback
 */

import {
  TunnelInterface,
  type ConnectOptions,
  type SendMessageOptions,
  type MessageCallback,
} from "./TunnelInterface";

export interface RemoteTunnelOptions {
  reconnect?: boolean;
  reconnectDelay?: number;
  host?: string;
}

const DEFAULT_HOST = "heyatlas-agents-rooms.bishwenduk029.partykit.dev";

export class RemoteTunnel extends TunnelInterface {
  private websocket: WebSocket | null = null;
  private currentUrl: string | null = null;
  private currentRoom: string | null = null;
  private options: RemoteTunnelOptions;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RemoteTunnelOptions = {}) {
    super();
    this.options = {
      reconnect: true,
      reconnectDelay: 3000,
      ...options,
    };
  }

  /**
   * Connect to a room by room ID (convenience method).
   * Handles URL formation internally.
   */
  async connectToRoom(
    roomId: string,
    options: ConnectOptions = {},
  ): Promise<void> {
    const host = this.options.host || DEFAULT_HOST;
    const protocol = host.includes("localhost") ? "ws" : "wss";
    const url = `${protocol}://${host}/parties/main/${roomId}`;
    return this.connect(url, options);
  }

  /**
   * Connect to a relay tunnel.
   */
  async connect(url: string, options: ConnectOptions = {}): Promise<void> {
    try {
      this._agentId = options.agentId || this._agentId;
      const role = options.role || "agent";

      const separator = url.includes("?") ? "&" : "?";
      const fullUrl = `${url}${separator}id=${this._agentId}&role=${role}`;
      this.currentUrl = url;

      // Extract room name from URL
      const roomMatch = url.match(/\/parties\/\w+\/([^?]+)/);
      this.currentRoom = roomMatch?.[1] ?? null;

      this.websocket = new WebSocket(fullUrl);

      await new Promise<void>((resolve, reject) => {
        if (!this.websocket) return reject(new Error("WebSocket not created"));

        this.websocket.onopen = () => {
          this._isConnected = true;
          resolve();
        };

        this.websocket.onerror = (error) => {
          reject(error);
        };

        this.websocket.onclose = () => this.handleClose();
        this.websocket.onmessage = (event) => this.handleMessage(event);
      });
    } catch (error) {
      this._isConnected = false;
      throw error;
    }
  }

  /**
   * Publish a task message to the tunnel.
   */
  async pub(
    message: string,
    options: SendMessageOptions = {},
  ): Promise<boolean> {
    if (!this.websocket || !this._isConnected) {
      return false;
    }

    const payload = {
      type: "tasks",
      content: message,
      agent: options.agent || "opencode",
      source: this._agentId,
      ...options,
    };

    try {
      this.websocket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Publish a raw payload to the tunnel.
   */
  async publish(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.websocket || !this._isConnected) {
      return false;
    }

    try {
      this.websocket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  // Legacy aliases
  async sendMessage(
    message: string,
    options: SendMessageOptions = {},
  ): Promise<boolean> {
    return this.pub(message, options);
  }

  async send(payload: Record<string, unknown>): Promise<boolean> {
    return this.publish(payload);
  }

  /**
   * Disconnect from the tunnel.
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    this.currentUrl = null;
    this.currentRoom = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.websocket) {
      try {
        this.websocket.close();
      } catch {
        // ignore
      }
      this.websocket = null;
    }
  }

  /**
   * Get the current room name.
   */
  get room(): string | null {
    return this.currentRoom;
  }

  private handleClose(): void {
    const wasConnected = this._isConnected;
    this._isConnected = false;

    if (this.options.reconnect && this.currentUrl && wasConnected) {
      this.reconnectTimeout = setTimeout(() => {
        if (this.currentUrl) {
          this.connect(this.currentUrl, { agentId: this._agentId }).catch(
            () => {},
          );
        }
      }, this.options.reconnectDelay);
    }
  }

  /**
   * Handle incoming messages and invoke subscriber callback.
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      const data = JSON.parse(event.data.toString());
      const msgType = data.type;

      let content: string | null = null;

      if (msgType === "task-response") {
        content = data.result || data.error;
      } else if (msgType === "task-update") {
        const status = data.status;
        if (["needs_input", "completed", "error"].includes(status)) {
          content = data.message || "";
        }
      } else if (msgType === "response") {
        content = data.content || "";
      } else if (msgType === "tasks") {
        content = data.content;
      }

      if (content && this._callback) {
        await Promise.resolve(this._callback(content, data));
      }
    } catch {
      // Silently ignore parse errors
    }
  }
}
