from e2b import Template

template = (
    Template()
    .from_template("code-interpreter-v1")
    # uv/uvx - installs to ~/.local/bin which is already in PATH
    .run_cmd("curl -LsSf https://astral.sh/uv/install.sh | sh")
    # bun
    .run_cmd("curl -fsSL https://bun.sh/install | bash")
    # opencode - symlink to ~/.local/bin so it's in PATH for non-interactive shells
    .run_cmd("curl -fsSL https://opencode.ai/install | bash")
    .run_cmd("ln -sf ~/.opencode/bin/opencode ~/.local/bin/opencode")
    # rclone - install to ~/.local/bin (no root needed)
    .run_cmd("curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip && unzip -j rclone-current-linux-amd64.zip '*/rclone' -d ~/.local/bin && rm rclone-current-linux-amd64.zip")
    # Pre-install Python packages used by opencode MCP servers
    .pip_install(["camel-ai", "arxiv", "python-pptx", "python-docx", "openpyxl", "cased-kit"])
    .npm_install(["chrome-devtools-mcp"])
    .make_dir("/home/user/agents")
)

# Alias for backwards compatibility
template_with_user_workdir = template
