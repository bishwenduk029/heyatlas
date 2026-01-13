# OpenCode Cloudflare Sandbox
# Based on official Cloudflare Sandbox SDK example
FROM docker.io/cloudflare/sandbox:0.6.10

# Add opencode install location to PATH before installation
ENV PATH="/root/.opencode/bin:${PATH}"

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh \
    && bash /tmp/install-opencode.sh \
    && rm /tmp/install-opencode.sh \
    && opencode --version

# Install heyatlas CLI for Atlas tunnel connection
RUN npm install -g heyatlas

# Set up workspace
WORKDIR /workspace

# Expose OpenCode server port
EXPOSE 4096
EXPOSE 3000
