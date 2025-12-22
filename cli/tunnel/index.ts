/**
 * Tunnel SDK for CLI agents
 *
 * Provides AtlasTunnel for WebSocket communication with Atlas agent.
 */

export {
  TunnelInterface,
  type MessageCallback,
  type ConnectOptions,
  type SendMessageOptions,
} from "./TunnelInterface";

export { AtlasTunnel, type AtlasTunnelOptions } from "./AtlasTunnel";
