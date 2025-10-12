FROM e2bdev/desktop:latest

# Install goose to /home/user/.local/bin for the user account
# First install to default location, then move to user's directory
RUN curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash && \
    mkdir -p /home/user/.local/bin && \
    mv /root/.local/bin/goose /home/user/.local/bin/goose && \
    chown -R user:user /home/user/.local/bin/goose

# Install nvm (Node Version Manager) for the user
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Install Node LTS using nvm and create symlink for easy access
RUN nvm install --lts && \
    nvm use --lts

# Install uv and uvx for the user
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Copy goose hints configuration
COPY .goosehints /home/user/agent/.goosehints