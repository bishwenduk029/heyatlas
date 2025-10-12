import json
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect

from websocket_server import WebSocketManager

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Agno Agent WebSocket Server")
    yield
    logger.info("Shutting down Agno Agent WebSocket Server")


app = FastAPI(title="Agno Agent WebSocket Server", lifespan=lifespan)

# WebSocket manager
manager = WebSocketManager()


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, user_id: str = Query(default="anonymous")
):
    """Main WebSocket endpoint for voice agent communication."""
    connection_id = None
    # user_id is already set from query parameter with default "anonymous"

    try:
        # Accept connection and create agent
        connection_id = await manager.connect(websocket, user_id)

        # Handle messages
        while True:
            try:
                # Receive message
                data = await websocket.receive_text()
                message = json.loads(data)

                # Handle the message
                await manager.handle_message(connection_id, user_id, message)

            except WebSocketDisconnect:
                break
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON from {user_id}: {e}")
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "Invalid message format"})
                )
            except Exception as e:
                logger.error(f"Error handling message from {user_id}: {e}")
                await websocket.send_text(
                    json.dumps({"type": "error", "message": "Internal server error"})
                )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnect for {user_id}")
    except Exception as e:
        logger.error(f"WebSocket connection error for {user_id}: {e}")
    finally:
        if connection_id:
            manager.disconnect(connection_id, user_id)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "connections": manager.connection_count()}


def main():
    """Entry point for CLI."""
    import uvicorn

    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
        access_log=False,  # Disable uvicorn access logs to avoid duplication
    )


if __name__ == "__main__":
    main()
