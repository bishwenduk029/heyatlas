#!/usr/bin/env python3
"""
Console test for Atlas setup.

Simulates voice-agent without LiveKit - pure text I/O.
Run with: uv run experimental/console_test.py

Requires:
1. Transport running: cd experimental/atlas/transport && pnpm dev
2. VoltAgent running: cd experimental/atlas/agent && pnpm dev
3. CLI (optional): cd cli && npx tsx index.ts warp goose --no-browser
"""

import asyncio
import json
import logging
import os
import sys

import httpx
import websockets
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

TRANSPORT_URL = os.getenv("ATLAS_TRANSPORT_URL", "http://localhost:1999")
TRANSPORT_WS = TRANSPORT_URL.replace("http://", "ws://").replace("https://", "wss://")
USER_ID = os.getenv("TEST_USER_ID", "test-user")


async def stream_response(user_input: str) -> str:
    """Send input to VoltAgent via transport proxy and stream response."""
    url = f"{TRANSPORT_URL}/party/{USER_ID}?proxy=/agents/atlas-assistant/stream"
    
    messages = [{"role": "user", "content": user_input}]
    payload = {"input": messages, "options": {}}
    
    full_response = ""
    
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            url,
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            timeout=60.0,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                logger.error(f"Error {response.status_code}: {body.decode()}")
                return ""
            
            async for line in response.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                
                try:
                    evt = json.loads(data)
                    evt_type = evt.get("type")
                    
                    if evt_type == "text-delta":
                        delta = evt.get("text") or evt.get("delta") or ""
                        print(delta, end="", flush=True)
                        full_response += delta
                    elif evt_type == "tool-call":
                        tool_name = evt.get("toolName", "unknown")
                        logger.info(f"\n🔧 Tool call: {tool_name}")
                    elif evt_type == "tool-result":
                        result = evt.get("result", "")
                        logger.info(f"📋 Tool result: {result[:100]}...")
                    elif evt_type == "finish":
                        break
                except json.JSONDecodeError:
                    continue
    
    print()  # newline after response
    return full_response


async def listen_for_updates(websocket):
    """Listen for task updates from CLI via transport."""
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                
                if msg_type == "task-response":
                    result = data.get("result") or data.get("error", "")
                    logger.info(f"\n📬 Task response: {result[:200]}...")
                elif msg_type == "task-update":
                    status = data.get("status", "")
                    message = data.get("message", "")
                    logger.info(f"\n📝 Task update ({status}): {message[:100]}...")
                elif msg_type == "connected":
                    logger.info("✅ Connected to transport")
            except json.JSONDecodeError:
                continue
    except websockets.exceptions.ConnectionClosed:
        logger.info("WebSocket closed")


async def main():
    print("\n🧪 Atlas Console Test")
    print("=" * 50)
    print(f"Transport: {TRANSPORT_URL}")
    print(f"User/Room: {USER_ID}")
    print("=" * 50)
    print("\nType messages to test. Commands:")
    print("  /quit - Exit")
    print("  /task <description> - Test ask_computer_agent tool")
    print()
    
    # Connect WebSocket for task updates
    ws_url = f"{TRANSPORT_WS}/parties/main/{USER_ID}?id=console-test&role=test"
    
    try:
        async with websockets.connect(ws_url) as websocket:
            # Start listener task
            listener_task = asyncio.create_task(listen_for_updates(websocket))
            
            while True:
                try:
                    user_input = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: input("\n🎤 You: ")
                    )
                except EOFError:
                    break
                
                if not user_input.strip():
                    continue
                
                if user_input.strip().lower() == "/quit":
                    break
                
                if user_input.strip().startswith("/task "):
                    # Direct task test - simulate tool call
                    task_desc = user_input[6:].strip()
                    user_input = f"Please use the computer agent to: {task_desc}"
                
                print("\n🤖 Atlas: ", end="")
                await stream_response(user_input)
            
            listener_task.cancel()
            
    except websockets.exceptions.ConnectionRefused:
        logger.error(f"❌ Cannot connect to transport at {TRANSPORT_WS}")
        logger.error("Make sure transport is running: cd experimental/atlas/transport && pnpm dev")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        sys.exit(1)
    
    print("\n👋 Goodbye!")


if __name__ == "__main__":
    asyncio.run(main())
