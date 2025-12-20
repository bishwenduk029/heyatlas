"""E2B Desktop implementation of the VirtualComputerProvider interface."""

import asyncio
import os
import uuid
from dataclasses import dataclass
from typing import Optional, Union

from e2b_desktop import Sandbox

from .interface import VirtualComputerProvider


@dataclass
class AgentConfig:
    """Configuration for an agent type."""

    port: int
    startup_command: str


class E2BProvider(VirtualComputerProvider):
    """
    E2B Desktop implementation of the virtual computer provider.

    Adapts the E2B Desktop SDK to conform to the VirtualComputerProvider interface.
    Uses built-in VNC streaming APIs for enhanced desktop streaming capabilities.
    """

    # Agent configuration - only agent-smith is supported
    AGENT_CONFIG = AgentConfig(
        port=3141,
        startup_command="bash -lc 'node {home}/agents/agent-smith.cjs >> {log_file} 2>&1'",
    )

    def __init__(self):
        """Initialize the E2B Desktop provider."""
        e2b_api_key = os.getenv("E2B_API_KEY")
        if not e2b_api_key:
            raise ValueError("E2B_API_KEY not configured in environment")
        self.api_key = e2b_api_key
        self._sandbox: Optional[Sandbox] = None
        self.home_directory = "/home/user"
        self._vnc_stream: Optional[str] = None

    async def launch_virtual_computer(
        self,
        user_id: str,
        template_id: str,
        env_vars: Optional[dict[str, str]] = None,
        timeout: int = 3600,
        virtual_key: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Launch an E2B Desktop sandbox instance with agent-smith.

        Args:
            user_id: User ID for tracking
            template_id: E2B Desktop template ID
            env_vars: Environment variables to inject into the sandbox
            timeout: Timeout in seconds (max 3600)
            virtual_key: Bifrost virtual key for LLM access

        Returns:
            Dictionary with sandbox_id and streaming URLs
        """
        # Generate sandbox callback token for secure communication back to PartyKit
        sandbox_callback_token = str(uuid.uuid4())
        party_host = os.getenv("PARTY_HOST", "")

        # Build env vars, filtering out None values (E2B doesn't accept nulls)
        shared_envs = {
            k: v
            for k, v in {
                "DISPLAY": ":0",
                "HEYATLAS_PROVIDER_API_KEY": virtual_key,
                "HEYATLAS_PROVIDER_API_URL": os.getenv(
                    "BIFROST_URL", "http://localhost:8080"
                )
                + "/litellm",
                "SANDBOX_CALLBACK_TOKEN": sandbox_callback_token,
                "SANDBOX_USER_ID": user_id,
                "PARTY_HOST": party_host,
                **(env_vars or {}),
            }.items()
            if v is not None and v != ""
        }

        # Run blocking E2B operations in thread pool to avoid blocking event loop
        def _create_sandbox():
            sandbox = Sandbox.create(
                template=template_id,
                api_key=self.api_key,
                timeout=timeout,
                envs=shared_envs,
            )

            # Use E2B Desktop's built-in VNC streaming API
            sandbox.stream.start()
            vnc_stream = sandbox.stream.get_url()

            print(f"VNC stream started at: {vnc_stream}")

            # Start agent-smith
            log_file = "/tmp/agent-smith.log"
            log_stream_port = int(os.getenv("E2B_LOG_PORT", "9001"))
            sandbox.commands.run(f"touch {log_file}")

            agent_command = self.AGENT_CONFIG.startup_command.format(
                log_file=log_file, home=self.home_directory
            )

            sandbox.commands.run(
                agent_command,
                background=True,
                envs=shared_envs,
            )

            # Expose logs via Logdy for UI embedding
            sandbox.commands.run(
                f"logdy follow {log_file} --port {log_stream_port} --no-analytics > /dev/null 2>&1",
                background=True,
            )

            agent_base_url = f"https://{sandbox.get_host(self.AGENT_CONFIG.port)}"
            computer_agent_url = f"{agent_base_url}/agents/agent-smith/text"
            logs_url = f"https://{sandbox.get_host(log_stream_port)}"

            print(f"Computer agent URL: {computer_agent_url}")
            print(f"Agent logs available at {logs_url}")

            return sandbox, vnc_stream, computer_agent_url, logs_url

        # Run in thread to avoid blocking the event loop
        (
            self._sandbox,
            vnc_stream,
            computer_agent_url,
            logs_url,
        ) = await asyncio.to_thread(_create_sandbox)
        self._vnc_stream = vnc_stream

        return {
            "vnc_stream": vnc_stream,
            "vnc_url": vnc_stream,
            "computer_agent_url": computer_agent_url,
            "logs_url": logs_url,
            "sandbox_callback_token": sandbox_callback_token,
        }

    def type(self, text: str) -> None:
        """
        Type text in the E2B Desktop sandbox.

        Args:
            text: Text to type

        Raises:
            RuntimeError: If sandbox is not launched
        """
        if not self._sandbox:
            raise RuntimeError(
                "Virtual computer not launched. Call launch_virtual_computer() first."
            )

        self._sandbox.write(text)

    def hit(self, key: Union[str, list[str]]) -> None:
        """
        Press a key in the E2B Desktop sandbox.

        Args:
            key: Key to press (e.g., "enter", "tab", ["ctrl", "c"])

        Raises:
            RuntimeError: If sandbox is not launched
        """
        if not self._sandbox:
            raise RuntimeError(
                "Virtual computer not launched. Call launch_virtual_computer() first."
            )

        self._sandbox.press(key)

    def close(self) -> None:
        """
        Close the E2B Desktop sandbox and stop VNC streaming.
        """
        if self._sandbox:
            try:
                # Stop VNC stream if active
                if self._vnc_stream:
                    self._sandbox.desktop.stop_stream()
                    self._vnc_stream = None

                self._sandbox.close()
            except Exception as e:
                print(f"Error closing sandbox: {e}")
            finally:
                self._sandbox = None
                self._vnc_stream = None

    def launch_application(self, app_name: str) -> None:
        """
        Launch an application in the E2B Desktop sandbox.

        This is an E2B Desktop-specific helper method.

        Args:
            app_name: Name of the application to launch

        Raises:
            RuntimeError: If sandbox is not launched
        """
        if not self._sandbox:
            raise RuntimeError(
                "Virtual computer not launched. Call launch_virtual_computer() first."
            )

        self._sandbox.launch(app_name)

    def get_vnc_stream(self) -> Optional[str]:
        """
        Get the current VNC stream URL.

        Returns:
            VNC stream URL if available, None otherwise
        """
        return self._vnc_stream
