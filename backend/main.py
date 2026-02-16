from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
import os

try:
    from .database import engine, Base, SessionLocal
    from .routers import auth, files, sharing, admin
    from .models import User
    from .auth.utils import get_password_hash
    from .websockets import manager
except ImportError:
    from database import engine, Base, SessionLocal
    from routers import auth, files, sharing, admin
    from models import User
    from auth.utils import get_password_hash
    from websockets import manager


def ensure_schema_updates():
    with engine.begin() as conn:
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

    inspector = inspect(engine)
    if "files" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("files")]
        print(f"DEBUG: 'files' table columns in this DB: {columns}")
except Exception as e:
    print(f"Database setup error: {e}")
    pass

app = FastAPI(title="Cloud Storage API")

origins = [
    "*",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://self-hostable-cloud-storage-railway-flax.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Welcome to Cloud Storage API"}


app.include_router(auth.router)
app.include_router(files.router)
app.include_router(sharing.router)
app.include_router(admin.router)

from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket)
    try:
        while True:
            # Just keep connection alive, maybe handle ping/pong
            data = await websocket.receive_text()
            # Optional: handle incoming messages
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
