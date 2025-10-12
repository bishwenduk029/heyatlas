FROM trycua/cua-xfce@sha256:489300c35dbd23c83eaeb2ef825a1eaa2f54914bcf07fc5fa12cdf2400483945

USER cua

RUN sudo apt-get update && sudo apt-get install -y curl git wget build-essential libssl-dev

# Install goose to /home/cua/.local/bin for the user account
# First install to default location, then move to user's directory
RUN curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash

# Install nvm (Node Version Manager) for the user
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Install Node LTS using nvm and create symlink for easy access
RUN export NVM_DIR="/home/cua/.nvm" && \
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
    nvm install --lts && \
    nvm use --lts

# Install uv and uvx for the user
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Setup shell initialization for the user to load nvm
RUN echo 'export NVM_DIR="/home/cua/.nvm"' >> /home/cua/.bashrc && \
    echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> /home/cua/.bashrc && \
    echo 'export PATH="/home/cua/.local/bin:/home/cua/.cargo/bin:$PATH"' >> /home/cua/.bashrc

# Update PATH to include all user binaries
ENV PATH="/home/cua/.local/bin:/home/cua/.cargo/bin:${PATH}"
ENV NVM_DIR="/home/cua/.nvm"
ENV GOOD_BIN_DIR="/home/cua/.local/bin"

# Copy goose hints configuration
COPY .goosehints /home/cua/agent/.goosehints

EXPOSE 8002