#!/bin/bash
# Startup script for Desktop Agent
# This runs in the xfce4-terminal for visibility in VNC

echo "=================================================="
echo "🤖 Desktop Agent with Claude SDK"
echo "=================================================="
echo ""
echo "Starting server on http://localhost:8080"
echo ""
echo "Waiting for tasks from Voice Agent..."
echo ""

# Run the desktop agent server
cd /home/user/agent
python server.py
