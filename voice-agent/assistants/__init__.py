"""
Voice Assistant Tiers Module

Three-tier hierarchy based on pricing plans:
- GeninAssistant: Basic tier (free)
- ChuninAssistant: Pro tier (memory + web search)
- JoninAssistant: Elite tier (full cloud computer)

Uses registry pattern + dependency injection for IoC.
"""

# Import classes to trigger @register_assistant decorators
from .genin import GeninAssistant
from .chunin import ChuninAssistant
from .jonin import JoninAssistant

# Import factory and context
from .container import create_assistant
from .context import AssistantContext
from .registry import list_registered_tiers

__all__ = [
    "GeninAssistant",
    "ChuninAssistant",
    "JoninAssistant",
    "create_assistant",
    "AssistantContext",
    "list_registered_tiers",
]
