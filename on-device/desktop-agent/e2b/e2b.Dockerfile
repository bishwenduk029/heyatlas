FROM e2bdev/desktop:latest

# Install Python and pip if not already present
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Create agent directory
RUN mkdir -p /home/user/agent

# Install nvm (Node Version Manager) for the user
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    mkdir -p /home/user/.nvm && \
    mv /root/.nvm/* /home/user/.nvm/ 2>/dev/null || true

# Install Node LTS using nvm and create symlink for easy access
RUN export NVM_DIR="/home/user/.nvm" && \
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
    nvm install --lts && \
    nvm use --lts && \
    # Create symlink to node for easier PATH setup
    mkdir -p /home/user/.local/bin && \
    ln -sf $(which node) /home/user/.local/bin/node && \
    ln -sf $(which npm) /home/user/.local/bin/npm && \
    ln -sf $(which npx) /home/user/.local/bin/npx

# Install uv and uvx for the user
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mkdir -p /home/user/.cargo/bin && \
    mv /root/.cargo/bin/uv /home/user/.cargo/bin/uv 2>/dev/null || true && \
    mv /root/.cargo/bin/uvx /home/user/.cargo/bin/uvx 2>/dev/null || true && \
    chmod +x /home/user/.cargo/bin/uv /home/user/.cargo/bin/uvx 2>/dev/null || true

# Copy desktop agent files
COPY agent/pyproject.toml /home/user/agent/
COPY agent/server.py /home/user/agent/
COPY agent/start.sh /home/user/agent/
RUN chmod +x /home/user/agent/start.sh

# Install desktop agent dependencies
RUN cd /home/user/agent && \
    python3 -m pip install --user -e .

# Setup shell initialization for the user to load nvm
RUN echo 'export NVM_DIR="/home/user/.nvm"' >> /home/user/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> /home/user/.bashrc && \
    echo 'export PATH="/home/user/.local/bin:/home/user/.cargo/bin:$PATH"' >> /home/user/.bashrc

# Update PATH to include all user binaries
ENV PATH="/home/user/.local/bin:/home/user/.cargo/bin:${PATH}"
ENV NVM_DIR="/home/user/.nvm"

# Set user permissions
RUN chown -R user:user /home/user/agent
