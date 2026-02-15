from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from .database import engine, Base
    from .routers import auth, files, sharing, webhooks
except ImportError:
    from database import engine, Base
    from routers import auth, files, sharing, webhooks

# Create tables
try:
    Base.metadata.create_all(bind=engine)
    
    # DEBUG: Inspect table columns
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "files" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("files")]
        print(f"DEBUG: 'files' table columns in this DB: {columns}")
    else:
        print("DEBUG: 'files' table NOT FOUND in this DB")

except Exception as e:
    print(f"Database setup error: {e}")
    # Continue startup even if DB fails, to allow CORS/healthcheck
    pass

app = FastAPI(title="Cloud Storage API")

# CORS
origins = [
    "http://localhost:5173", # Vite default
    "http://localhost:3000",
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
app.include_router(webhooks.router)
