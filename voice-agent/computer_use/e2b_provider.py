"""E2B Desktop implementation of the VirtualComputerProvider interface."""

import os
import re
from dataclasses import dataclass
from typing import Optional, Union

import httpx
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

    # Agent configuration registry
    AGENT_CONFIGS = {
        "goose": AgentConfig(
            port=8002,
            startup_command="bash -lc 'goose web --port 8002 --host 0.0.0.0 >> {log_file} 2>&1'",
        ),
        "agno": AgentConfig(
            port=8001,
            startup_command="bash -lc 'cd {home}/agents && uv venv && uv pip install agno_agent-0.1.0-py2.py3-none-any.whl && uv run agno-agent >> {log_file} 2>&1'",
        ),
        "claude": AgentConfig(
            port=8003,
            startup_command="bash -lc 'cd {home}/agents && uv venv && uv pip install claude_agent-0.1.0-py2.py3-none-any.whl && uv run claude-agent >> {log_file} 2>&1'",
        ),
        "opencode": AgentConfig(
            port=8004,
            startup_command="bash -lc 'cd {home}/agents && bun opencode-bridge.js >> {log_file} 2>&1'",
        ),
    }

    def __init__(self):
        """
        Initialize the E2B Desktop provider.
        """
        e2b_api_key = os.getenv("E2B_API_KEY")
        if not e2b_api_key:
            raise ValueError("E2B_API_KEY not configured in environment")
        self.api_key = e2b_api_key
        self._sandbox: Optional[Sandbox] = None
        self.home_directory = (
            "/home/user"  # E2B Desktop sandboxes use 'user' by default
        )
        self._vnc_stream: Optional[str] = None

    def _fetch_config_from_api(self, agent_type: str, user_id: str) -> Optional[str]:
        """Fetch agent configuration from the Web API."""
        web_url = os.getenv("WEB_URL", "http://localhost:3000")
        api_key = os.getenv("NIRMANUS_API_KEY")

        if not api_key:
            return None

        try:
            url = f"{web_url}/api/agents/config"
            headers = {"Authorization": f"Bearer {api_key}"}
            params = {"userId": user_id, "agentType": agent_type}

            # Use a timeout to prevent hanging if web is down
            response = httpx.get(url, headers=headers, params=params, timeout=5.0)

            if response.status_code == 200:
                data = response.json()
                return data.get("config")
            else:
                print(f"API fetch failed: {response.status_code} {response.text}")
                return None
        except Exception as e:
            print(f"Error fetching config from API: {e}")
            return None

    def _get_agent_config(
        self, agent_type: str, user_id: str, virtual_key: Optional[str] = None
    ) -> Optional[tuple[str, str]]:
        """
        Get configuration content and destination path for a specific agent.

        Args:
            agent_type: The type of agent (goose, opencode, etc)
            user_id: User ID for substitutions
            virtual_key: Optional Bifrost virtual key

        Returns:
            Tuple of (config_content, destination_path) or None if no config needed
        """
        # Determine paths
        base_dir = os.path.dirname(os.path.dirname(__file__))  # voice-agent root
        agent_dir = os.path.join(base_dir, "backend_agents", agent_type)

        # 1. Try fetching from Web API first
        api_config = self._fetch_config_from_api(agent_type, user_id)
        if api_config:
            # Logic matches file-based approach for destination
            if agent_type == "goose":
                dest_path = f"{self.home_directory}/.config/goose/config.yaml"
            elif agent_type == "opencode":
                dest_path = f"{self.home_directory}/.config/opencode/opencode.json"
            else:
                dest_path = None

            if dest_path:
                content = api_config
                # Perform substitutions
                if virtual_key:
                    content = re.sub(r"\$\{NIRMANUS_API_KEY\}", virtual_key, content)
                bifrost_url = os.getenv("BIFROST_URL", "http://localhost:8000/v1")
                content = re.sub(r"\$\{BIFROST_URL\}", bifrost_url, content)
                content = re.sub(r"\$\{USER_ID\}", user_id, content)
                return (content, dest_path)

        # 2. Fallback to file-based config
        if agent_type == "goose":
            config_path = os.path.join(agent_dir, "goose.config.yaml")
            dest_path = f"{self.home_directory}/.config/goose/config.yaml"
        elif agent_type == "opencode":
            config_path = os.path.join(agent_dir, "opencode.json")
            dest_path = f"{self.home_directory}/.config/opencode/opencode.json"
        else:
            return None

        # Read config content
        try:
            with open(config_path, "r") as f:
                content = f.read()
        except FileNotFoundError:
            return None

        # Perform substitutions
        if virtual_key:
            content = re.sub(r"\$\{NIRMANUS_API_KEY\}", virtual_key, content)

        bifrost_url = os.getenv("BIFROST_URL", "http://localhost:8000/v1")
        content = re.sub(r"\$\{BIFROST_URL\}", bifrost_url, content)
        content = re.sub(r"\$\{USER_ID\}", user_id, content)

        return (content, dest_path)

    async def launch_virtual_computer(
        self,
        user_id: str,
        template_id: str,
        env_vars: Optional[dict[str, str]] = None,
        timeout: int = 3600,
        agent_type: str = "agno",
        virtual_key: Optional[str] = None,
    ) -> dict[str, str]:
        """
        Launch an E2B Desktop sandbox instance.

        Args:
            template_id: E2B Desktop template ID
            env_vars: Environment variables to inject into the sandbox
            user_id: User ID for goose memory configuration
            timeout: Timeout in seconds (max 3600)
            virtual_key: Optional Bifrost virtual key to use instead of fetching from environment
        Returns:
            Dictionary with sandbox_id and streaming URLs
        """

        # Use provided key or fetch from Web API if not provided
        bifrost_key = virtual_key

        # Construct the correct ANTHROPIC_BASE_URL for Bifrost
        # The blog post specifies using "/anthropic" suffix, NOT "/v1/anthropic"
        # BIFROST_URL usually includes "/v1" (e.g. http://localhost:8000/v1)
        # So we need to strip "/v1" and append "/anthropic"
        # bifrost_base = os.getenv("BIFROST_URL", "http://localhost:8000/v1")
        # if bifrost_base.endswith("/v1"):
        #     anthropic_base_url = bifrost_base[:-3] + "/anthropic"
        # else:
        #     anthropic_base_url = bifrost_base + "/anthropic"

        # Build env vars, filtering out None values (E2B doesn't accept nulls)
        shared_envs = {
            k: v
            for k, v in {
                "LITELLM_API_KEY": bifrost_key,
                "LITELLM_HOST": os.getenv("BIFROST_URL", "http://localhost:8080")
                + "/litellm",
                **(env_vars or {}),
            }.items()
            if v is not None and v != ""
        }

        # Create sandbox using E2B Desktop API
        self._sandbox = Sandbox.create(
            template=template_id,
            api_key=self.api_key,
            timeout=timeout,
            envs=shared_envs,
        )

        # Process and write agent configuration if available
        config_data = self._get_agent_config(
            agent_type, user_id, virtual_key=bifrost_key
        )
        if config_data:
            content, dest_path = config_data
            # Ensure directory exists
            config_dir = os.path.dirname(dest_path)
            self._sandbox.commands.run(f"mkdir -p {config_dir}")
            self._sandbox.files.write(dest_path, content)

        # Use E2B Desktop's built-in VNC streaming API
        self._sandbox.stream.start()
        vnc_stream = self._sandbox.stream.get_url()
        self._vnc_stream = vnc_stream

        print(f"VNC stream started at: {vnc_stream}")

        # Get agent configuration from registry
        agent_config = self.AGENT_CONFIGS.get(agent_type)
        if not agent_config:
            supported = ", ".join(self.AGENT_CONFIGS.keys())
            raise ValueError(
                f"Unknown agent type: '{agent_type}'. Supported: {supported}"
            )

        log_file = f"/tmp/{agent_type}_agent.log"
        log_stream_port = int(os.getenv("E2B_LOG_PORT", "9001"))
        self._sandbox.commands.run(f"touch {log_file}")

        # Format command with log_file and home_directory
        agent_command = agent_config.startup_command.format(
            log_file=log_file, home=self.home_directory
        )
        agent_port = agent_config.port

        self._sandbox.commands.run(
            agent_command,
            background=True,
            envs=shared_envs,
        )

        # Expose logs via Logdy for UI embedding (discard logdy's own output)
        self._sandbox.commands.run(
            f"logdy follow {log_file} --port {log_stream_port} --no-analytics > /dev/null 2>&1",
            background=True,
        )

        # All agents use WebSocket
        computer_agent_url = f"wss://{self._sandbox.get_host(agent_port)}/ws"

        logs_url = f"https://{self._sandbox.get_host(log_stream_port)}"
        print(f"Computer agent URL: {computer_agent_url}")
        print(f"Agent logs available at {logs_url}")

        return {
            "vnc_stream": vnc_stream,
            "vnc_url": vnc_stream,  # Backward compatibility
            "computer_agent_url": computer_agent_url,
            "logs_url": logs_url,
            "agent_type": agent_type,
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
