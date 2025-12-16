/**
 * TunnelInterface - Abstract interface for remote tunnel implementations.
 */

export type MessageCallback = (
  content: string,
  data?: Record<string, unknown>
) => void | Promise<void>;

export interface ConnectOptions {
  agentId?: string;
  role?: string;
  [key: string]: unknown;
}

export interface SendMessageOptions {
  agent?: string;
  [key: string]: unknown;
}

export abstract class TunnelInterface {
  protected _callback: MessageCallback | null = null;
  protected _isConnected: boolean = false;
  protected _agentId: string = "heyatlas-cli";

  /**
   * Connect to a relay room.
   */
  abstract connect(url: string, options?: ConnectOptions): Promise<void>;

  /**
   * Publish a task message to the tunnel.
   */
  abstract pub(message: string, options?: SendMessageOptions): Promise<boolean>;

  /**
   * Publish a raw payload to the tunnel.
   */
  abstract publish(payload: Record<string, unknown>): Promise<boolean>;

  /**
   * Disconnect from the tunnel.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Subscribe to incoming messages with a callback.
   */
  sub(callback: MessageCallback): void {
    this._callback = callback;
  }

  /**
   * Check if connected to a tunnel.
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get the agent identifier.
   */
  get agentId(): string {
    return this._agentId;
  }

  // Legacy alias
  setCallback(callback: MessageCallback): void {
    this.sub(callback);
  }
}
