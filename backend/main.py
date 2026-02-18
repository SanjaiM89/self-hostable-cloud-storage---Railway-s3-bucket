from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
# ... (database imports)

# ... (ensure_schema_updates function)

# ... (app = FastAPI() definition - need to find where it is)

# Iterate to find app definition

from sqlalchemy import inspect, text
import os

try:
    from .database import engine, Base, SessionLocal
    from .routers import auth, files, sharing, admin, ai, plans, payments
    from .music import router as music
    from .models import User
    from .auth.utils import get_password_hash
    from .ws_manager import manager
except ImportError:
    from database import engine, Base, SessionLocal
    from routers import auth, files, sharing, admin, ai, plans, payments
    from music import router as music
    from models import User
    from auth.utils import get_password_hash
    from ws_manager import manager


def ensure_schema_updates():
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN storage_limit BIGINT DEFAULT 2147483648"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE files ADD COLUMN is_trashed BOOLEAN DEFAULT FALSE"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE files ADD COLUMN trashed_at TIMESTAMP NULL"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE files ADD COLUMN original_parent_id INTEGER NULL"))
        except Exception:
            pass
        try:
            # PostgreSQL specific JSONB or JSON
            conn.execute(text("ALTER TABLE users ADD COLUMN ai_config JSON DEFAULT '{}'"))
        except Exception:
            pass


def ensure_default_admin_user():
    username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@gmail.com")
    password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")

    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == username).first()
        if not admin_user:
            admin_user = User(
                username=username,
                email=email,
                hashed_password=get_password_hash(password),
                is_admin=True,
            )
            db.add(admin_user)
            db.commit()
        elif not admin_user.is_admin:
            admin_user.is_admin = True
            db.commit()
    finally:
        db.close()


try:
    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    ensure_default_admin_user()


except Exception as e:
    print(f"Database setup error: {e}")
    pass

app = FastAPI(title="Cloud Storage API")

# CORS: allow all origins without credentials (wildcard + credentials is invalid)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://lazycloudio.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Welcome to Cloud Storage API"}


# Create a main API router
api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(files.router)
api_router.include_router(sharing.router)
api_router.include_router(ai.router)
api_router.include_router(admin.router)
api_router.include_router(plans.router, prefix="/plans", tags=["plans"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(music.router)

app.include_router(api_router)

# Only register WebSocket endpoint when NOT on Vercel (Vercel doesn't support WS)
IS_VERCEL = bool(os.environ.get("VERCEL"))

if not IS_VERCEL:
    from fastapi import WebSocket, WebSocketDisconnect

    @app.websocket("/ws/{client_id}")
    async def websocket_endpoint(websocket: WebSocket, client_id: str):
        await manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket)
        except Exception:
            manager.disconnect(websocket)
