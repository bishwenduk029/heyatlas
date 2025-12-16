"""
User management utilities
"""

import logging
import os

from mem0 import MemoryClient

logger = logging.getLogger(__name__)


def initialize_memory(user_id: str, bifrost_key: str) -> MemoryClient:
    """
    Initialize Mem0 memory instance for user.

    Args:
        user_id: User identifier
        bifrost_key: Bifrost API key for authentication

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
            user_id=user_id,
            limit=5,
            threshold=0.7,
        )
        if results.get("results"):
            logger.info(
                f"🧠 Persona details: {[r.get('memory', '') for r in results['results']]}"
            )
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
        heyatlas_key = os.getenv("HEYATLAS_API_KEY")

        if heyatlas_key:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{web_url}/api/user/virtual-key",
                    params={"userId": user_id},
                    headers={"HEYATLAS_API_KEY": heyatlas_key},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    bifrost_key = data.get("key")
                    assistant_tier = data.get("assistantTier", "genin")

                    if bifrost_key:
                        logger.info(f"✅ User {user_id} - Plan: {assistant_tier}")
                        return bifrost_key, assistant_tier
                    else:
                        logger.warning(f"No virtual key found for user {user_id}")
                        return None, "genin"
                else:
                    logger.warning(f"Failed to fetch key (status {resp.status_code})")
                    return None, "genin"
    except Exception as e:
        logger.warning(f"Error fetching user data: {e}")

    return None, "genin"
