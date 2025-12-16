"""
Job metadata parsing utilities
"""

import json
import logging
from typing import TypedDict

logger = logging.getLogger(__name__)


class JobMetadata(TypedDict):
    """Typed dictionary for parsed job metadata."""

    user_id: str


def parse_job_metadata(metadata_raw: str | None) -> JobMetadata:
    """
    Parse job metadata and return consistent user information.

    Args:
        metadata_raw: Raw metadata string from job context

    Returns:
        JobMetadata with user_id
    """
    try:
        metadata_raw = metadata_raw or "{}"
        if isinstance(metadata_raw, str):
            metadata = json.loads(metadata_raw) if metadata_raw else {}
        else:
            metadata = metadata_raw or {}

        return JobMetadata(user_id=metadata.get("user_id", "anonymous"))
    except Exception as e:
        logger.warning(f"⚠️  Error parsing job metadata: {e}")
        return JobMetadata(user_id="anonymous")
