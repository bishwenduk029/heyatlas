"""
Abstract base class for agent clients following Inversion of Control pattern.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class BaseAgentClient(ABC):
    """
    Abstract base class defining the interface for all agent clients.

    This enables dependency injection and makes agents interchangeable.
    Follows the Dependency Inversion Principle.
    """

    def __init__(self):
        self._callback: Optional[Callable] = None
        self._is_connected: bool = False

    @abstractmethod
    async def connect(self, url: str, **kwargs) -> None:
        """
        Connect to the agent's WebSocket endpoint.

        Args:
            url: WebSocket URL to connect to
            **kwargs: Additional connection parameters
                - user_id: User identifier (used by Agno)
                - Other agent-specific parameters
        """
        pass

    @abstractmethod
    async def send_message(self, message: str, **kwargs) -> bool:
        """
        Send a task message to the agent.

        Args:
            message: Task description to send
            **kwargs: Additional parameters
                - session_id: Session identifier (used by Agno)
                - Other agent-specific parameters

        Returns:
            True if message sent successfully, False otherwise
        """
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the connection to the agent."""
        pass

    def set_callback(self, callback: Callable) -> None:
        """
        Set the callback function for handling agent responses.

        Args:
            callback: Async function to call when agent sends a response
        """
        self._callback = callback
        logger.info(f"✅ Response callback registered for {self.__class__.__name__}")

    @property
    def is_connected(self) -> bool:
        """Check if the agent is currently connected."""
        return self._is_connected

    @property
    def agent_name(self) -> str:
        """Get the name of the agent (e.g., 'Goose', 'Agno')."""
        return self.__class__.__name__.replace("Client", "")
