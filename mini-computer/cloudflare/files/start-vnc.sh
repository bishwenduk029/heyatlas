#!/bin/bash

# VNC Server Startup Script
# Based on E2B Desktop SDK implementation
# Starts Xvfb, Xfce4 desktop, x11vnc, and noVNC

set -e

# Configuration
DISPLAY="${DISPLAY:-:0}"
SCREEN_WIDTH="${SCREEN_WIDTH:-1024}"
SCREEN_HEIGHT="${SCREEN_HEIGHT:-768}"
SCREEN_DEPTH="${SCREEN_DEPTH:-24}"
DPI="${DPI:-96}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"

export DISPLAY

echo "Starting Desktop Environment..."
echo "Display: $DISPLAY"
echo "Resolution: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} @ ${DPI}dpi"
echo "VNC Port: $VNC_PORT"
echo "noVNC Port: $NOVNC_PORT"

# Clean up any existing X locks
rm -f /tmp/.X*-lock 2>/dev/null || true
rm -rf /tmp/.X11-unix 2>/dev/null || true
mkdir -p /tmp/.X11-unix

# Start Xvfb (virtual framebuffer) - matching E2B's exact flags
echo "Starting Xvfb..."
Xvfb $DISPLAY -ac -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} \
    -retro -dpi $DPI -nolisten tcp -nolisten unix &
XVFB_PID=$!

# Wait for Xvfb to be ready
echo "Waiting for Xvfb..."
for i in {1..20}; do
    if xdpyinfo -display $DISPLAY >/dev/null 2>&1; then
        echo "Xvfb is ready"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "ERROR: Xvfb failed to start"
        exit 1
    fi
    sleep 0.5
done

# Start Xfce4 desktop environment
echo "Starting Xfce4 desktop..."
startxfce4 &
XFCE_PID=$!
sleep 2

# Start x11vnc server - matching E2B's exact flags
echo "Starting x11vnc..."
x11vnc -bg \
    -display $DISPLAY \
    -forever \
    -wait 50 \
    -shared \
    -rfbport $VNC_PORT \
    -nopw \
    2>/tmp/x11vnc_stderr.log

# Wait for VNC to be listening
echo "Waiting for x11vnc..."
for i in {1..20}; do
    if netstat -tuln 2>/dev/null | grep -q ":$VNC_PORT "; then
        echo "x11vnc is ready"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "ERROR: x11vnc failed to start"
        cat /tmp/x11vnc_stderr.log 2>/dev/null || true
        exit 1
    fi
    sleep 0.5
done

# Start noVNC (websockify proxy)
# Explicitly listen on all interfaces (0.0.0.0)
echo "Starting noVNC on port 8080..."
cd /opt/noVNC/utils && ./novnc_proxy \
    --vnc localhost:$VNC_PORT \
    --listen 8080 \
    --web /opt/noVNC \
    > /tmp/novnc.log 2>&1 &
NOVNC_PID=$!

# Wait for noVNC to be listening
echo "Waiting for noVNC..."
for i in {1..20}; do
    if netstat -tuln 2>/dev/null | grep -q ":8080 "; then
        echo "noVNC is ready"
        break
    fi
    
    # Check if process is still running
    if ! kill -0 $NOVNC_PID 2>/dev/null; then
        echo "ERROR: noVNC process died"
        cat /tmp/novnc.log
        exit 1
    fi
    
    if [ $i -eq 20 ]; then
        echo "ERROR: noVNC failed to start (timeout)"
        cat /tmp/novnc.log
        exit 1
    fi
    sleep 0.5
done

# Dump logs to stdout for debugging
cat /tmp/novnc.log

echo ""
echo "=========================================="
echo "Desktop Environment started successfully!"
echo "=========================================="
echo "VNC: vnc://localhost:$VNC_PORT"
echo "noVNC (web): http://localhost:8080/vnc.html"
echo "=========================================="
echo ""

# Function to cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $NOVNC_PID 2>/dev/null || true
    pkill x11vnc 2>/dev/null || true
    kill $XFCE_PID 2>/dev/null || true
    kill $XVFB_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Keep the script running
wait $NOVNC_PID
