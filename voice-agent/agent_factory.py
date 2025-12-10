"""
Factory for creating agent clients based on configuration.
Implements the Factory pattern for Inversion of Control.
"""
import os
import logging
from typing import Type
from backend_agents import (
    BaseAgentClient,
    GooseClient,
    AgnoClient,
    ClaudeClient,
    OpenCodeClient,
)

logger = logging.getLogger(__name__)


class AgentFactory:
    """
    Factory class for creating agent clients based on environment configuration.
    
    Usage:
        agent = AgentFactory.create_agent()  # Uses AGENT_TYPE env var
        agent = AgentFactory.create_agent("agno")  # Explicit type
    """

    _AGENT_REGISTRY: dict[str, Type[BaseAgentClient]] = {
        "goose": GooseClient,
        "agno": AgnoClient,
        "claude": ClaudeClient,
        "opencode": OpenCodeClient,
    }

    @classmethod
    def create_agent(cls, agent_type: str | None = None) -> BaseAgentClient:
        """
        Create an agent client instance based on type.
        
        Args:
            agent_type: Type of agent ("goose" or "agno"). 
                       If None, reads from AGENT_TYPE env var (defaults to "agno")
        
        Returns:
            Instance of the appropriate agent client
            
        Raises:
            ValueError: If agent_type is not supported
        """
        # Determine agent type from parameter or environment
        agent_type = agent_type or os.getenv("AGENT_TYPE", "agno")
        agent_type = agent_type.lower()

        # Look up agent class in registry
        agent_class = cls._AGENT_REGISTRY.get(agent_type)

        if not agent_class:
            supported = ", ".join(cls._AGENT_REGISTRY.keys())
            raise ValueError(
                f"Unknown agent type: '{agent_type}'. "
                f"Supported types: {supported}"
            )

        logger.info(f"🏭 AgentFactory creating {agent_type} agent")
        return agent_class()

    @classmethod
    def register_agent(cls, name: str, agent_class: Type[BaseAgentClient]) -> None:
        """
        Register a new agent type in the factory.
        
        Allows extending the system with new agents without modifying this file.
        
        Args:
            name: Agent type name (e.g., "claude")
            agent_class: Agent class that inherits from BaseAgentClient
        """
        cls._AGENT_REGISTRY[name] = agent_class
        logger.info(f"✅ Registered new agent type: {name}")

    @classmethod
    def list_agents(cls) -> list[str]:
        """Get a list of all registered agent types."""
        return list(cls._AGENT_REGISTRY.keys())
