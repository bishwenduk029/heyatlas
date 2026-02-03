from e2b import CopyItem, Template, wait_for_port

template = (
    Template(file_context_path="files")
    .from_image("ubuntu:24.04")
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
            # Node.js setup
            "NODE_VERSION": "20",
            # PATH setup for user (includes uv/uvx location)
            "PATH": "/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/user/.local/bin",
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
            "dbus-x11",
            "util-linux",
            "sudo",
            "curl",
            "git",
            "wget",
            "software-properties-common",
            "python3-pip",
            "python3-venv",
            "xdotool",
            "scrot",
            "ffmpeg",
            "x11vnc",
            "net-tools",
            "netcat-openbsd",
            "x11-apps",
            "libreoffice",
            "xpdf",
            "gedit",
            "xpaint",
            "tint2",
            "galculator",
            "pcmanfm",
            "apt-transport-https",
            "libgtk-3-bin",
            "ca-certificates",
            "gnupg",
            "lsb-release",
        ]
    )
    # Install numpy via apt (PEP 668 prevents global pip installs in 24.04)
    .apt_install(["python3-numpy"])
    # Install Node.js 20 using NodeSource
    .run_cmd(
        [
            "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
            "apt-get install -y nodejs",
        ]
    )
    # Install uv and make uvx globally available
    .run_cmd(
        [
            "curl -LsSf https://astral.sh/uv/install.sh | sh",
            # Move uv and uvx to /usr/local/bin for global access and fix permissions
            "cp /root/.local/bin/uv /usr/local/bin/uv",
            "cp /root/.local/bin/uvx /usr/local/bin/uvx",
            "chmod +x /usr/local/bin/uv /usr/local/bin/uvx",
        ]
    )
    .run_cmd(
        [
            "curl -fsSL https://bun.sh/install | bash",
            "cp /root/.bun/bin/bun /usr/local/bin/bun",
            "chmod +x /usr/local/bin/bun",
        ]
    )
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
    # Make novnc_proxy executable and install websockify dependencies
    .run_cmd(
        [
            "chmod +x /opt/noVNC/utils/novnc_proxy",
            "pip3 install --break-system-packages websockify",
        ]
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
    # Setup user environment for uv and Python packages
    .run_cmd(
        [
            # Setup user directories
            "mkdir -p /home/user/.local/bin",
            "mkdir -p /home/user/.local/lib/python3.12/site-packages",
            # Setup uv for user (copying from known location)
            "cp /usr/local/bin/uv /home/user/.local/bin/ || true",
            "cp /usr/local/bin/uvx /home/user/.local/bin/ || true",
            "cp /usr/local/bin/bun /home/user/.local/bin/ || true",
            # Copy installed Python packages to user
            "cp -r /root/.local/lib/python*/site-packages/* /home/user/.local/lib/python3.12/site-packages/ 2>/dev/null || true",
            # Set permissions
            "chown -R user:user /home/user/.local",
        ]
    )
    # Add PATH to user's shell profile
    .run_cmd(
        [
            'echo "export PATH=/home/user/.local/bin:$PATH" >> /home/user/.bashrc',
            'echo "export PATH=/home/user/.local/bin:$PATH" >> /home/user/.bash_profile',
        ]
    )
    # Configure system settings
    .make_symlink(
        "/usr/bin/xfce4-terminal.wrapper",
        "/etc/alternatives/x-terminal-emulator",
        force=True,
    )
    .run_cmd("update-alternatives --set x-www-browser /usr/bin/firefox-esr")
    .make_dir("/home/user/.config/Code/User")
    .make_dir("/home/user/.config/xfce4/xfconf/xfce-perchannel-xml/")
    .make_dir("/home/user/agents")
    .run_cmd("update-desktop-database /usr/share/applications/")
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
            CopyItem(
                src="start_command.sh",
                dest="/start_command.sh",
            ),
        ]
    )
    # Make start command executable
    .run_cmd("chmod +x /start_command.sh")
    # Set user and workdir before finalizing
    .set_user("user")
    .set_workdir("/home/user")
    # Set start command (finalizes template)
    .set_start_cmd("/start_command.sh", wait_for_port(6080))
)

# Alias for backwards compatibility
template_with_user_workdir = template
