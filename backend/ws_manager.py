from fastapi import WebSocket
from typing import List, Dict
import json

class ConnectionManager:
    def __init__(self):
        # Store active connections: client_id -> list of WebSockets
        # Or just a list of all connections if we broadcast to all
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Filter out closed connections if necessary, but typically remove on disconnect
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                # If sending fails, we might want to remove it, 
                # but usually disconnect handles it.
                pass

manager = ConnectionManager()
