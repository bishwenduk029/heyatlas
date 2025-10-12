import asyncio
import json
import websockets
import time
import logging
import httpx
from typing import Optional, Callable
from livekit.agents import AgentSession
from urllib.parse import urlparse
from agent_interface import BaseAgentClient

logger = logging.getLogger(__name__)


class GooseClient(BaseAgentClient):
    def __init__(self, ws_url: str = "ws://localhost:8002/ws"):
        super().__init__()  # Initialize base class
        self.ws_url = ws_url
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.session_id = self._generate_session_id()
        self.response_callback: Optional[Callable] = None
        self.current_streaming_content = ""  # Track streaming responses
        
    def _generate_session_id(self):
        """Generate session ID using CLI format (yyyymmdd_hhmmss)"""
        now = time.localtime()
        return f"{now.tm_year}{now.tm_mon:02d}{now.tm_mday:02d}_{now.tm_hour:02d}{now.tm_min:02d}{now.tm_sec:02d}"

    async def connect(self, agent_url: str, **kwargs):
        """Connect to goose web server websocket and create session"""
        try:
            # Extract base URL from WebSocket URL (e.g., wss://host/ws -> https://host)
            parsed = urlparse(agent_url)
            base_url = f"{'https' if parsed.scheme == 'wss' else 'http'}://{parsed.netloc}"
            
            # Step 1: Create a session on the server
            logger.info(f"📝 Creating session on goose server: {base_url}")
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{base_url}/", follow_redirects=True)
                
                # Extract session ID from the redirected URL
                # The server redirects to /session/{session_id}
                if "/session/" in response.url.path:
                    self.session_id = response.url.path.split("/session/")[-1]
                    logger.info(f"✅ Session created: {self.session_id}")
                else:
                    logger.warning(f"⚠️  Could not extract session ID from redirect, using generated ID: {self.session_id}")
            
            # Step 2: Connect WebSocket
            self.websocket = await websockets.connect(agent_url)
            self._is_connected = True
            logger.info(f"✅ Connected to goose web server - Session: {self.session_id}")
            # Start listening for responses in the background
            asyncio.create_task(self._listen_for_responses())
            return True
        except Exception as e:
            logger.error(f"❌ Goose connection failed: {e}")
            logger.info("💡 Make sure goose web server is running: 'goose web --port 8002'")
            self._is_connected = False
            return False

    async def _listen_for_responses(self):
        """Listen for goose responses and forward to callback"""
        try:
            logger.info("📡 Starting to listen for WebSocket messages...")
            async for message in self.websocket:
                if not self.is_connected:
                    logger.info("📡 WebSocket connection closed, stopping listener")
                    break
                    
                # Handle ping/pong for connection keepalive
                if message == "ping":
                    logger.debug("🏓 Received ping, sending pong")
                    await self.websocket.pong("pong")
                    continue
                    
                logger.debug(f"📨 Received message: {message[:100]}")
                data = json.loads(message)
                logger.debug(f"📨 Parsed data type: {data.get('type', 'unknown')}")
                
                # Handle message types based on goose WebSocket protocol
                if data.get("type") == "response":
                    # Accumulate streaming content (like script.js does)
                    content = data.get("content", "")
                    self.current_streaming_content += content
                    logger.debug(f"🦢 Streaming response chunk: {content[:50]}...")
                    # Don't forward yet - wait for complete
                    
                elif data.get("type") == "complete":
                    # Now forward the complete accumulated response
                    if self.current_streaming_content and self.response_callback:
                        logger.info(f"✅ Complete response received, forwarding: {self.current_streaming_content[:100]}...")
                        await self.response_callback(self.current_streaming_content)
                    # Reset for next message
                    self.current_streaming_content = ""
                    
                elif data.get("type") == "error":
                    if self.response_callback:
                        error_msg = data.get('message', 'Unknown error')
                        logger.error(f"❌ Forwarding error to callback: {error_msg}")
                        await self.response_callback(f"[ERROR] {error_msg}")
                    # Reset streaming content on error
                    self.current_streaming_content = ""
                    
                elif data.get("type") == "thinking":
                    logger.debug("🧠 Goose is thinking...")
                    
                elif data.get("type") == "tool_request":
                    tool_name = data.get('tool_name', 'unknown')
                    logger.debug(f"🔧 Goose requesting tool: {tool_name}")
                    
                elif data.get("type") == "tool_response":
                    logger.info("🔧 Tool response received")
                    await self.response_callback(f"[TOOL RESPONSE RECEIVED] {data.get('content', '')}")
                    
                elif data.get("type") == "cancelled":
                    logger.info("🚫 Goose task was cancelled")
                    self.current_streaming_content = ""
                    
                elif data.get("type") == "context_exceeded":
                    logger.warning("⚠️ Goose context exceeded")
                    
                else:
                    logger.warning(f"❓ Unknown message type: {data.get('type', 'unknown')}")
                        
        except websockets.exceptions.ConnectionClosed:
            logger.info("📡 WebSocket connection closed normally")
            self._is_connected = False
        except Exception as e:
            logger.error(f"❌ Error listening for goose responses: {e}")
            self._is_connected = False

    async def send_message(self, text: str, **kwargs):
        """Send message to goose via websocket"""
        if not self.is_connected or not self.websocket:
            return False
            
        try:
            # Add the response format instruction to govern Goose behavior
            enhanced_task = f"{text}\n\nRespond back in this format: \nFor the task {{task}}, I have made progress {{what was the progress/completed}}, pending your confirmation or help or input {{what input/help/confirmation}}. As you progress always keep updating the memory accordingly and if you need user's input, ask specifically for it."
            
            message = {
                "type": "message",
                "content": enhanced_task,
                "session_id": self.session_id,
                "timestamp": int(time.time() * 1000)
            }
            print(f"📤 Sending message to goose: {text}...")
            await self.websocket.send(json.dumps(message))
            return True
            
        except Exception as e:
            logger.error(f"❌ Error sending message to goose: {e}")
            self._is_connected = False
            return False

    def set_callback(self, callback: Callable):
        """Set callback for handling responses"""
        self.response_callback = callback

    async def disconnect(self):
        """Disconnect from goose websocket"""
        self._is_connected = False
        if self.websocket:
            try:
                # Send proper close frame
                await self.websocket.close(code=1000, reason="Client disconnecting")
            except Exception as e:
                logger.error(f"❌ Error closing websocket: {e}")
            finally:
                self.websocket = None
