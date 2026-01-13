"""Job metadata parsing and user key fetching."""

import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def parse_job_metadata(raw: str | None) -> dict:
    """Parse job metadata JSON."""
    try:
        return json.loads(raw or "{}") if raw else {}
    except Exception as e:
        logger.warning(f"Error parsing metadata: {e}")
        return {}


async def get_user_virtual_key(user_id: str) -> tuple[Optional[str], str]:
    """
    Fetch user's virtual key from web API.

    Returns:
        Tuple of (bifrost_key, tier)
    """
    web_url = os.getenv("WEB_URL", "http://localhost:3000")
    nirmanus_key = os.getenv("NIRMANUS_API_KEY")

    logger.info(f"[VirtualKey] Fetching for user_id={user_id}")
    logger.info(f"[VirtualKey] WEB_URL={web_url}, NIRMANUS_API_KEY={'set' if nirmanus_key else 'NOT SET'}")

    if not nirmanus_key:
        logger.warning("[VirtualKey] NIRMANUS_API_KEY not set, returning None")
        return None, "genin"

    try:
        url = f"{web_url}/api/user/virtual-key"
        headers = {"NIRMANUS_API_KEY": nirmanus_key}
        params = {"userId": user_id}

        logger.info(f"[VirtualKey] GET {url} params={params}")

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, headers=headers, timeout=5.0)

            logger.info(f"[VirtualKey] Response: status={resp.status_code}, body={resp.text[:200] if resp.text else 'empty'}")

            if resp.status_code == 200:
                data = resp.json()
                key = data.get("key")
                tier = data.get("assistantTier", "genin")
                logger.info(f"[VirtualKey] Got key={'set' if key else 'NOT SET'}, tier={tier}")
                return key, tier
            elif resp.status_code == 404:
                logger.warning(f"[VirtualKey] User {user_id} not found in database - this user needs to sign up first")
            else:
                logger.warning(f"[VirtualKey] Failed: {resp.status_code} - {resp.text[:200]}")

    except Exception as e:
        logger.warning(f"[VirtualKey] Error: {e}")

    return None, "genin"
