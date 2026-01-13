# Claude Code Cloudflare Sandbox
# Based on official Cloudflare Sandbox SDK example
FROM docker.io/cloudflare/sandbox:0.6.10

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Increase command timeout for long-running Claude Code operations
ENV COMMAND_TIMEOUT_MS=300000

# Install heyatlas CLI for Atlas tunnel connection
RUN npm install -g heyatlas

# Set up workspace
WORKDIR /workspace

EXPOSE 3000
