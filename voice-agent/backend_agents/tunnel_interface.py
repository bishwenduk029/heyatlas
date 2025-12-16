"""
TunnelInterface - Abstract interface for remote tunnel implementations.
"""

import logging
from abc import ABC, abstractmethod
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class TunnelInterface(ABC):
    """Abstract interface for remote tunnel implementations."""

    def __init__(self):
        self._callback: Optional[Callable] = None
        self._is_connected: bool = False

    @abstractmethod
    async def connect(self, url: str, **kwargs) -> None:
        """Connect to a relay room."""
        pass

    @abstractmethod
    async def pub(self, message: str, **kwargs) -> bool:
        """Publish a task message to the tunnel."""
        pass

    @abstractmethod
    async def publish(self, payload: dict) -> bool:
        """Publish a raw payload to the tunnel."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the tunnel."""
        pass

    def sub(self, callback: Callable) -> None:
        """Subscribe to incoming messages with a callback."""
        self._callback = callback
        logger.info("✅ Subscribed to tunnel messages")

    @property
    def is_connected(self) -> bool:
        """Check if connected to a tunnel."""
        return self._is_connected

    # Legacy alias
    def set_callback(self, callback: Callable) -> None:
        self._callback = callback
