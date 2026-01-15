# syntax=docker/dockerfile:1
# Desktop Sandbox - Minimal version for Cloudflare containers

FROM ubuntu:22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    DEBIAN_PRIORITY=high \
    PIP_DEFAULT_TIMEOUT=100 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    NODE_VERSION=20 \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/user/.local/bin"

USER root
WORKDIR /

# Install minimal desktop packages (skip unminimize to save space)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11-utils \
    x11-xserver-utils \
    xauth \
    xfce4 \
    xfce4-terminal \
    sudo \
    curl \
    git \
    wget \
    python3-pip \
    python3-venv \
    xdotool \
    scrot \
    x11vnc \
    net-tools \
    netcat \
    ca-certificates \
    gnupg \
    dbus-x11 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Python packages and uv
RUN pip3 install --no-cache-dir numpy uv

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Setup NoVNC and websockify
RUN git clone --depth 1 --branch e2b-desktop https://github.com/e2b-dev/noVNC.git /opt/noVNC \
    && ln -sf /opt/noVNC/vnc.html /opt/noVNC/index.html \
    && git clone --depth 1 --branch v0.12.0 https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify \
    && rm -rf /opt/noVNC/.git /opt/noVNC/utils/websockify/.git

# Install Firefox only (lightweight browser)
RUN apt-get update \
    && apt-get install -y --no-install-recommends firefox \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create user and setup directories
RUN useradd -m -s /bin/bash user \
    && mkdir -p /home/user/.local/bin \
    && mkdir -p /home/user/.config/xfce4/xfconf/xfce-perchannel-xml \
    && mkdir -p /home/user/agents

# Add PATH to user's shell profile
RUN echo "export PATH=/home/user/.local/bin:\$PATH" >> /home/user/.bashrc

# Configure terminal as default
RUN update-alternatives --set x-terminal-emulator /usr/bin/xfce4-terminal.wrapper 2>/dev/null || true

# Copy configuration files
COPY files/wallpaper.png /usr/share/backgrounds/xfce/wallpaper.png
COPY files/xfce4-desktop.xml /home/user/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml

# Copy and install agent-smith-py
COPY files/agent-smith-py /home/user/agents/agent-smith-py
RUN pip3 install --no-cache-dir /home/user/agents/agent-smith-py[full]

# Copy and setup VNC startup script
COPY files/start-vnc.sh /usr/local/bin/start-vnc.sh
RUN chmod +x /usr/local/bin/start-vnc.sh

# Set ownership
RUN chown -R user:user /home/user

# Set DISPLAY
ENV DISPLAY=:0

USER user
WORKDIR /home/user

EXPOSE 5900 8080

CMD ["/usr/local/bin/start-vnc.sh"]
