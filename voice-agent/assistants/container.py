"""
Simple Factory Function with Registry Pattern

NO dependency-injector library needed!
Just registry lookup + lazy instantiation.
Only the requested assistant gets created.
"""

import logging

from .context import AssistantContext
from .registry import get_assistant_class

logger = logging.getLogger(__name__)


def create_assistant(tier: str, user_id: str, room, bifrost_key: str):
    """
    Factory function to create an assistant.

    **LAZY INITIALIZATION** - Only creates the assistant you ask for!
    No if/elif needed - registry handles the lookup.

    Args:
        tier: Assistant tier ("genin", "chunin", "jonin")
        user_id: User identifier
        room: LiveKit room
        bifrost_key: API key

    Returns:
        Configured assistant instance (only the one requested!)

    Example:
        >>> assistant = create_assistant("chunin", "user123", room, "key")
        # Only ChuninAssistant gets created, nothing else!
    """
    # Create dependency context (lightweight Pydantic model)
    ctx = AssistantContext(
        user_id=user_id,
        room=room,
        bifrost_key=bifrost_key,
    )

    # Get class from registry (NO if/elif!)
    assistant_class = get_assistant_class(tier)

    # Create ONLY this assistant (lazy!)
    logger.info(f"🏭 Creating {assistant_class.__name__} for tier: {tier}")
    return assistant_class(ctx)
