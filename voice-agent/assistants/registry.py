"""
Assistant Registry Pattern

Auto-registration of assistant classes using decorators.
Combined with dependency injection for production-grade IoC.
"""

import logging
from typing import Type, Dict

logger = logging.getLogger(__name__)

# Global registry of assistant classes
_ASSISTANT_REGISTRY: Dict[str, Type] = {}


def register_assistant(tier: str):
    """
    Decorator to register an assistant class for a specific tier.

    Usage:
        @register_assistant("genin")
        class GeninAssistant(Agent):
            ...

    Args:
        tier: Tier name ("genin", "chunin", "jonin")
    """
    def decorator(cls):
        _ASSISTANT_REGISTRY[tier] = cls
        return cls
    return decorator


def get_assistant_class(tier: str) -> Type:
    """
    Get assistant class for a tier.

    Args:
        tier: Tier name

    Returns:
        Assistant class

    Raises:
        ValueError: If tier not registered
    """
    if tier not in _ASSISTANT_REGISTRY:
        available = ", ".join(_ASSISTANT_REGISTRY.keys())
        raise ValueError(
            f"Unknown tier: {tier}. Available tiers: {available}"
        )
    return _ASSISTANT_REGISTRY[tier]


def list_registered_tiers() -> list[str]:
    """Return list of all registered tiers."""
    return list(_ASSISTANT_REGISTRY.keys())
