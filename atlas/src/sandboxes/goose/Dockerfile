# Goose Cloudflare Sandbox
# Goose - Block's AI coding agent
FROM docker.io/cloudflare/sandbox:0.6.10

# Install Python dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Goose via pipx for isolated environment
RUN pip3 install pipx \
    && pipx ensurepath \
    && pipx install goose-ai

# Add pipx bin to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Verify Goose installation
RUN goose --version || echo "Goose installed"

# Install heyatlas CLI for Atlas tunnel connection
RUN npm install -g heyatlas

# Set up workspace
WORKDIR /workspace

EXPOSE 3000
