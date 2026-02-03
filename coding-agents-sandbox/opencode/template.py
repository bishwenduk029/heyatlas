from e2b import Template

template = (
    Template()
    .from_ubuntu_image()
    .set_user("root")
    .set_workdir("/workspace")
    .set_envs(
        {
            "DEBIAN_FRONTEND": "noninteractive",
            "DEBIAN_PRIORITY": "high",
            "PIP_DEFAULT_TIMEOUT": "100",
            "PIP_DISABLE_PIP_VERSION_CHECK": "1",
            "PIP_NO_CACHE_DIR": "1",
            "NODE_VERSION": "20",
            "PATH": "/root/.opencode/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        }
    )
    .apt_install(
        [
            "curl",
            "git",
            "wget",
            "ca-certificates",
            "gnupg",
            "unzip",
        ]
    )
    # Install Node.js 20 using NodeSource
    .run_cmd(
        [
            "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
            "apt-get install -y nodejs",
        ]
    )
    # Install OpenCode CLI
    .run_cmd(
        [
            "curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh",
            "bash /tmp/install-opencode.sh",
            "rm /tmp/install-opencode.sh",
        ]
    )
    # Install uv and make uvx globally available for all users
    .run_cmd(
        [
            "curl -LsSf https://astral.sh/uv/install.sh | sh",
            "cp /root/.local/bin/uv /usr/local/bin/uv",
            "cp /root/.local/bin/uvx /usr/local/bin/uvx",
            "chmod +x /usr/local/bin/uv /usr/local/bin/uvx",
        ]
    )
    # Install heyatlas CLI for Atlas tunnel connection
    .run_cmd("npm install -g heyatlas")
    # Symlink opencode to /usr/local/bin so it's always in PATH
    .run_cmd("ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode")
)
