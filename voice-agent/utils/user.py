"""
User management utilities
"""

import logging
import os

from mem0 import MemoryClient

logger = logging.getLogger(__name__)


def initialize_memory() -> MemoryClient:
    """
    Initialize Mem0 memory instance for user.

    Args:
        user_id: User identifier
        bifrost_key: User's virtual key (unused here, kept for signature compatibility)

    Returns:
        MemoryClient instance
    """
    client = MemoryClient(api_key=os.getenv("MEM0_API_KEY"))
    return client


def generate_persona(memory: MemoryClient, user_id: str) -> str:
    """
    Generate user persona from stored memories.

    Args:
        memory: MemoryClient instance
        user_id: User identifier

    Returns:
        Persona string combining relevant memories
    """
    try:
        results = memory.search(
            "user information name details",
            filters={"user_id": user_id},
            limit=5,
        )
        if results.get("results"):
            return "\n".join([r.get("memory", "") for r in results["results"]])
        return ""
    except Exception as e:
        logger.warning(f"Error generating persona: {e}")
        return ""


async def get_user_virtual_key(user_id: str) -> tuple[str | None, str]:
    """
    Fetch user's virtual key and assistant tier from web API.

    Args:
        user_id: User identifier

    Returns:
        Tuple of (bifrost_key, assistant_tier)
        assistant_tier options: "genin", "chunin", "jonin"
    """
    try:
        import httpx

        web_url = os.getenv("WEB_URL", "http://localhost:3000")
        nirmanus_key = os.getenv("NIRMANUS_API_KEY")

        if not nirmanus_key:
            return None, "genin"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{web_url}/api/user/virtual-key",
                params={"userId": user_id},
                headers={"NIRMANUS_API_KEY": nirmanus_key},
                timeout=5.0,
            )

            if resp.status_code == 200:
                data = resp.json()
                bifrost_key = data.get("key")
                assistant_tier = data.get("assistantTier", "genin")

                if bifrost_key:
                    return bifrost_key, assistant_tier
                else:
                    return None, "genin"
            else:
                return None, "genin"

    except Exception:
        return None, "genin"
