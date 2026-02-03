#!/bin/bash

# Set display
export DISPLAY=${DISPLAY:-:0}

# Start Xvfb (X virtual framebuffer)
Xvfb $DISPLAY -ac -screen 0 1920x1080x24 -nolisten tcp &
sleep 2

# Start dbus session (required for XFCE)
eval $(dbus-launch --sh-syntax)
export DBUS_SESSION_BUS_ADDRESS

# Start XFCE session
startxfce4 &
sleep 5

# Start VNC server
x11vnc -bg -display $DISPLAY -forever -wait 50 -shared -rfbport 5900 -nopw \
    -noxdamage -noxfixes -nowf -noscr -ping 1 -repeat -speeds lan &
sleep 2

# Start noVNC server (websocket proxy for browser access)
cd /opt/noVNC/utils && ./novnc_proxy --vnc localhost:5900 --listen 6080 --web /opt/noVNC --heartbeat 30 &
sleep 2

# Keep the container running
tail -f /dev/null
