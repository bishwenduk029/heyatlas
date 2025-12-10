"""Backend agents module for voice agent orchestration."""
from .agent_interface import BaseAgentClient
from .agno.agno_client import AgnoClient
from .claude.claude_client import ClaudeClient
from .goose.goose_client import GooseClient
from .opencode.opencode_client import OpenCodeClient

__all__ = [
    "BaseAgentClient",
    "AgnoClient",
    "ClaudeClient",
    "GooseClient",
    "OpenCodeClient",
]
