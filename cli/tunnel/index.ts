/**
 * Virtual Agent SDK for TypeScript/Bun
 *
 * Provides RemoteTunnel for pub/sub communication with relay servers.
 */

export {
  TunnelInterface,
  type MessageCallback,
  type ConnectOptions,
  type SendMessageOptions
} from "./TunnelInterface";

export {
  RemoteTunnel,
  type RemoteTunnelOptions
} from "./RemoteTunnel";

// Legacy aliases
export { TunnelInterface as BaseVirtualAgent } from "./TunnelInterface";
export { RemoteTunnel as RoomAgent } from "./RemoteTunnel";
export type { RemoteTunnelOptions as RoomAgentOptions } from "./RemoteTunnel";
