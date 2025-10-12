"""Minimal MCP configuration helpers for the Agno agent."""

import os
from datetime import timedelta
from typing import Optional

from agno.tools.mcp import StreamableHTTPClientParams


class MCPConfig:
    """Small helpers for configuring MCP connections."""

    MEMORY_URL = "https://memory-use-bold-paper-239.fly.dev/mcp"
    MEMORY_TIMEOUT = 400
    WEB_BROWSER_COMMAND = "npx @playwright/mcp@latest"

    @staticmethod
    def get_memory_params(user_id: str) -> Optional[StreamableHTTPClientParams]:
        """Return Streamable HTTP parameters for the memory MCP server."""

        api_key = os.getenv("NIRMANUS_API_KEY")
        if not api_key:
            return None

        return StreamableHTTPClientParams(
            url=os.getenv("MEMORY_MCP_URL", MCPConfig.MEMORY_URL),
            headers={
                "NIRMANUS_API_KEY": api_key,
                "X-User-ID": user_id,
            },
            timeout=timedelta(seconds=int(os.getenv("MEMORY_MCP_TIMEOUT", MCPConfig.MEMORY_TIMEOUT))),
        )
