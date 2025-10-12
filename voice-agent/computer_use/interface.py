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
        template_id: str,
        env_vars: Optional[dict[str, str]] = None,
        user_id: Optional[str] = None,
        timeout: int = 3600,
        agent_type: str = "goose",
        virtual_key: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Launch a virtual computer instance.
        
        Args:
            template_id: The template/image identifier for the virtual computer
            env_vars: Optional environment variables to inject
            user_id: Optional user ID for goose memory configuration
            timeout: Timeout in seconds for the instance
            agent_type: Automation agent to run inside the sandbox ("goose" | "agno")
            virtual_key: Optional Bifrost virtual key for LLM usage
            
        Returns:
            Dictionary containing:
                - sandbox_id: Unique identifier for the instance
                - monitor_url: URL to monitor/access the instance
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
