"""
Assistant Context - Pydantic model for dependency injection.

This bundles all dependencies needed to create an assistant,
making the constructor signatures clean and type-safe.
"""

from typing import Any
from pydantic import BaseModel, ConfigDict


class AssistantContext(BaseModel):
    """
    Context containing all dependencies for creating an assistant.

    This is the "dependency bundle" that gets injected into assistants.
    Using Pydantic provides type safety and validation.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    room: Any  # LiveKit room object (not Pydantic-friendly)
    bifrost_key: str  # Required - each user must have unique virtual key for token tracking

    def __repr__(self) -> str:
        return f"AssistantContext(user_id={self.user_id!r})"
