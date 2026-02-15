from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from .database import engine, Base
    from .routers import auth, files, sharing, webhooks
except ImportError:
    from database import engine, Base
    from routers import auth, files, sharing, webhooks

# Create tables
Base.metadata.create_all(bind=engine)

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
