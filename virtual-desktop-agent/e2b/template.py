from e2b import CopyItem, Template, wait_for_port

template = (
    Template(file_context_path="files")
    .from_image("ubuntu:22.04")
    .set_user("root")
    .set_workdir("/")
    .set_envs(
        {
            # Avoid system prompts
            "DEBIAN_FRONTEND": "noninteractive",
            "DEBIAN_PRIORITY": "high",
            # Pip settings
            "PIP_DEFAULT_TIMEOUT": "100",
            "PIP_DISABLE_PIP_VERSION_CHECK": "1",
            "PIP_NO_CACHE_DIR": "1",
        }
    )
    # Initial system setup and packages
    .run_cmd("yes | unminimize")
    .apt_install(
        [
            "xserver-xorg",
            "x11-xserver-utils",
            "xvfb",
            "x11-utils",
            "xauth",
            "xfce4",
            "xfce4-goodies",
            "util-linux",
            "sudo",
            "curl",
            "git",
            "wget",
            "python3-pip",
            "xdotool",
            "scrot",
            "ffmpeg",
            "x11vnc",
            "net-tools",
            "netcat",
            "x11-apps",
            "libreoffice",
            "xpdf",
            "gedit",
            "xpaint",
            "tint2",
            "galculator",
            "pcmanfm",
            "software-properties-common",
            "apt-transport-https",
            "libgtk-3-bin",
        ]
    )
    .pip_install("numpy")
    # Setup NoVNC and websockify
    .git_clone(
        "https://github.com/e2b-dev/noVNC.git", "/opt/noVNC", branch="e2b-desktop"
    )
    .make_symlink("/opt/noVNC/vnc.html", "/opt/noVNC/index.html")
    .git_clone(
        "https://github.com/novnc/websockify.git",
        "/opt/noVNC/utils/websockify",
        branch="v0.12.0",
    )
    # Install browsers and set up repositories
    .run_cmd(
        [
            "add-apt-repository ppa:mozillateam/ppa",
            "wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -",
            'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list',
            "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | apt-key add -",
            'add-apt-repository -y "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main"',
            "apt-get update",
        ],
    )
    # Install browsers and VS Code
    .apt_install(["firefox-esr", "google-chrome-stable", "code"])
    # Configure system settings
    .make_symlink(
        "/usr/bin/xfce4-terminal.wrapper",
        "/etc/alternatives/x-terminal-emulator",
        force=True,
    )
    .run_cmd("update-alternatives --set x-www-browser /usr/bin/firefox-esr")
    .make_dir("/home/user/.config/Code/User")
    .make_dir("/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/")
    .run_cmd("update-desktop-database /usr/share/applications/")
    # Install goose and move to /home/user/.local/bin (as root it installs to /root/.local/bin)
    .run_cmd(
        "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash"
    )
    .run_cmd(
        "mkdir -p /home/user/.local/bin && mv /root/.local/bin/goose /home/user/.local/bin/goose && chown -R user:user /home/user/.local/bin/goose"
    )
    # Install nvm (Node Version Manager) to /usr/local/nvm for system-wide access
    .run_cmd(
        "export NVM_DIR=/usr/local/nvm && mkdir -p $NVM_DIR && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
    )
    # Install Node LTS and copy binaries to /usr/local/bin
    .run_cmd(
        'bash -c \'export NVM_DIR=/usr/local/nvm && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install --lts && nvm use --lts && n=$(which node) && n=${n%/bin/node} && chmod -R 755 $n/bin/* && cp -r $n/{bin,lib,share} /usr/local\''
    )
    # Install logdy for log streaming (installs directly to /usr/local/bin)
    .run_cmd("curl https://logdy.dev/install-silent.sh | sh")
    # Install Bun for OpenCode bridge
    .run_cmd("curl -fsSL https://bun.sh/install | bash && mv /root/.bun/bin/bun /usr/local/bin/bun && chmod 755 /usr/local/bin/bun")
    # Install opencode CLI
    .run_cmd("curl -fsSL https://opencode.ai/install | bash && mv /root/.opencode/bin/opencode /usr/local/bin/opencode && chmod 755 /usr/local/bin/opencode || true")
    # Install uv and move to /usr/local/bin for system-wide access (installs to /root/.local/bin as root)
    .run_cmd(
        "curl -LsSf https://astral.sh/uv/install.sh | bash && mv /root/.local/bin/uv /usr/local/bin/uv && mv /root/.local/bin/uvx /usr/local/bin/uvx && chmod 755 /usr/local/bin/uv /usr/local/bin/uvx"
    )
    .run_cmd("uv tool install cased-kit")
    # Fix ownership - user needs to own their home directory
    .make_dir("/home/user/agents")
    .run_cmd("chown -R user:user /home/user")
    # Clone and setup mcp-shrimp-task-manager
    .run_cmd(
        "git clone https://github.com/cjo4m06/mcp-shrimp-task-manager.git /home/user/mcp-shrimp-task-manager"
    )
    .run_cmd("cd /home/user/mcp-shrimp-task-manager && npm install")
    .run_cmd("cd /home/user/mcp-shrimp-task-manager && npm run build")
    # Copy all configuration files
    .copy_items(
        [
            CopyItem(
                src="google-chrome.desktop",
                dest="/usr/share/applications/google-chrome.desktop",
            ),
            CopyItem(
                src="settings.json",
                dest="/home/user/.config/Code/User/settings.json",
            ),
            CopyItem(
                src="wallpaper.png",
                dest="/usr/share/backgrounds/xfce/wallpaper.png",
            ),
            CopyItem(
                src="xfce4-desktop.xml",
                dest="/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml",
            ),
            CopyItem(
                src="firefox-policies.json",
                dest="/usr/lib/firefox-esr/distribution/policies.json",
            ),
            CopyItem(
                src="firefox-autoconfig.js",
                dest="/usr/lib/firefox-esr/defaults/pref/autoconfig.js",
            ),
            CopyItem(src="firefox.cfg", dest="/usr/lib/firefox-esr/firefox.cfg"),
            CopyItem(src=".goosehints", dest="/home/user/.goosehints"),
            # Copy agno-agent wheel (build with: just build-agno-agent)
            CopyItem(
                src="agno_agent-0.1.0-py2.py3-none-any.whl",
                dest="/home/user/agents/agno_agent-0.1.0-py2.py3-none-any.whl",
            ),
            # Copy claude-agent wheel
            CopyItem(
                src="claude_agent-0.1.0-py2.py3-none-any.whl",
                dest="/home/user/agents/claude_agent-0.1.0-py2.py3-none-any.whl",
            ),
            # Copy opencode-bridge bundle (build with: just build-opencode-bridge)
            CopyItem(
                src="opencode-bridge.js",
                dest="/home/user/agents/opencode-bridge.js",
            ),
        ]
    )
)

# Template with user and workdir set
template_with_user_workdir = template.set_user("user").set_workdir("/home/user")
