from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from .database import engine, Base
    from .routers import auth, files, sharing
except ImportError:
    from database import engine, Base
    from routers import auth, files, sharing

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
    "https://self-hostable-cloud-storage-railway-flax.vercel.app", # Add specific frontend
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
# app.include_router(webhooks.router) # Removed as file was deleted

@app.get("/debug-connection")
def debug_connection():
    import os
    results = {
        "env_vars": {
            "DATABASE_URL_SET": bool(os.getenv("DATABASE_URL")),
            "AWS_ACCESS_KEY_SET": bool(os.getenv("AWS_ACCESS_KEY_ID")),
            "S3_BUCKET_NAME": os.getenv("S3_BUCKET_NAME"),
            "S3_REGION_NAME": os.getenv("S3_REGION_NAME"),
            "BACKEND_URL": os.getenv("BACKEND_URL")
        }
    }
    
    # Test DB
    try:
        from .database import SessionLocal
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        results["database"] = "OK"
    except Exception as e:
        results["database"] = f"ERROR: {str(e)}"
        
    # Test S3
    try:
        from .storage import s3_client, BUCKET_NAME
        s3_client.list_objects_v2(Bucket=BUCKET_NAME, MaxKeys=1)
        results["s3"] = "OK"
    except Exception as e:
        results["s3"] = f"ERROR: {str(e)}"
        
    return results
