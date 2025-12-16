"""Backend agents module - virtual agent representations."""
from .tunnel_interface import TunnelInterface
from .remote_tunnel import RemoteTunnel
from .agno.agno_client import AgnoClient
from .claude.claude_client import ClaudeClient
from .goose.goose_client import GooseClient
from .opencode.opencode_client import OpenCodeClient

# Legacy aliases for backward compatibility
BaseVirtualAgent = TunnelInterface
BaseAgentClient = TunnelInterface
RoomAgent = RemoteTunnel
PartyClient = RemoteTunnel

__all__ = [
    "TunnelInterface",
    "RemoteTunnel",
    "AgnoClient",
    "ClaudeClient",
    "GooseClient",
    "OpenCodeClient",
    # Legacy
    "BaseVirtualAgent",
    "BaseAgentClient",
    "RoomAgent",
    "PartyClient",
]
