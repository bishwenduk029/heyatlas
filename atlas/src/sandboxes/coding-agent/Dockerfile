# Base Cloudflare Sandbox image for coding agents
# Version MUST match @cloudflare/sandbox npm package version
FROM docker.io/cloudflare/sandbox:0.6.10

# Install heyatlas CLI
RUN npm install -g heyatlas

# Install opencode (Go binary - lightweight)
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:$PATH"

# Set working directory
WORKDIR /workspace

# Expose port for Cloudflare Sandbox health checks
EXPOSE 8080

# Default command - start a simple HTTP server for health checks
# The actual agent is started via startProcess()
CMD ["sh", "-c", "python3 -m http.server 8080 & sleep infinity"]
