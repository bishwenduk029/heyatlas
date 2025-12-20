"""Abstract interface for virtual computer providers."""

from abc import ABC, abstractmethod
from typing import Optional, Union


class VirtualComputerProvider(ABC):
    """
    Abstract base class defining the contract for virtual computer providers.

    This interface allows easy switching between different providers (E2B, Cua.ai, etc.)
    by following the Dependency Inversion Principle.
    """

    @abstractmethod
    async def launch_virtual_computer(
        self,
        user_id: str,
        template_id: str,
        env_vars: Optional[dict[str, str]] = None,
        timeout: int = 3600,
        virtual_key: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Launch a virtual computer instance with agent-smith.

        Args:
            user_id: User ID for tracking
            template_id: The template/image identifier for the virtual computer
            env_vars: Optional environment variables to inject
            timeout: Timeout in seconds for the instance
            virtual_key: Bifrost virtual key for LLM access

        Returns:
            Dictionary containing:
                - vnc_stream: VNC stream URL
                - computer_agent_url: WebSocket URL for agent-smith
                - logs_url: Log stream URL
        """
        pass

    @abstractmethod
    def type(self, text: str) -> None:
        """
        Type text into the virtual computer.

        Args:
            text: The text to type
        """
        pass

    @abstractmethod
    def hit(self, key: Union[str, list[str]]) -> None:
        """
        Press a key on the virtual computer.

        Args:
            key: The key to press (e.g., "enter", "tab", "ctrl")
        """
        pass

    @abstractmethod
    def close(self) -> None:
        """
        Close/cleanup the virtual computer instance.
        """
        pass
