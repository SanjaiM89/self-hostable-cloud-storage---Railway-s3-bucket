import os
import uuid
import asyncio
import logging
from typing import Optional, Dict, List
from enum import Enum
from yt_dlp import YoutubeDL
from sqlalchemy.orm import Session
from .models import MusicMetadata
from .models import MusicMetadata
try:
    from backend.models import File as FileModel, User
except ImportError:
    from models import File as FileModel, User
import shutil

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Temporary Download Directory
DOWNLOAD_DIR = "/tmp/lazyio_downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

class DownloadStatus(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    CONVERTING = "converting"
    COMPLETED = "completed"
    FAILED = "failed"

class DownloadTask:
    def __init__(self, url: str, user_id: int, quality: str = "320"):
        self.task_id = str(uuid.uuid4())
        self.url = url
        self.user_id = user_id
        self.quality = quality
        self.status = DownloadStatus.PENDING
        self.progress = 0
        self.title = "Fetching..."
        self.thumbnail = ""
        self.error = None
        self.file_path = None
        self.meta = {}

# In-memory task store (Use Redis for production)
tasks: Dict[str, DownloadTask] = {}

async def process_download(task_id: str, db: Session, user: User, music_folder_id: int):
    task = tasks.get(task_id)
    if not task:
        return

    try:
        task.status = DownloadStatus.DOWNLOADING
        
        # yt-dlp Options
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'{DOWNLOAD_DIR}/{task_id}_%(title)s.%(ext)s',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': task.quality,
            }],
            'progress_hooks': [lambda d: update_progress(task, d)],
            'quiet': True,
            'no_warnings': True,
        }
        
        # Use cookies if available
        cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
        if os.path.exists(cookies_path):
            ydl_opts['cookiefile'] = cookies_path

        def run_yt_dlp():
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(task.url, download=True)
                return info

        # Run blocking yt-dlp in executor
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, run_yt_dlp)

        task.status = DownloadStatus.CONVERTING
        task.title = info.get('title', 'Unknown')
        task.thumbnail = info.get('thumbnail', '')
        task.meta = {
            'artist': info.get('artist') or info.get('uploader'),
            'album': info.get('album'),
            'duration': info.get('duration'),
            'title': info.get('title')
        }

        # Find the downloaded file
        # yt-dlp might change extension
        downloaded_file = None
        for f in os.listdir(DOWNLOAD_DIR):
            if f.startswith(task_id) and f.endswith(".mp3"):
                downloaded_file = os.path.join(DOWNLOAD_DIR, f)
                break
        
        if not downloaded_file:
            raise Exception("File not found after download")

        # Move to S3 (Simulated by registering FileModel and moving to storage path if local, 
        # but for S3 we need to upload. Assuming local storage for now based on 'FileModel' usage in this project context 
        # or we need to use the `upload_file` logic from files router)
        
        # checks if we are using S3 or Local from env? 
        # The prompt implies S3 integration "Change the storage mechanism... to S3". 
        # However, the existing system likely has an upload helper. 
        # For simplicity in this step, we will register it as a File and let the system handle it.
        # But wait, we need to actually PUT the bytes to S3 if it's S3.
        
        # Let's assume we use the keys from env.
        # For now, let's implement the "Local to S3" upload logic here or re-use existing.
        # Since I can't easily import the S3 upload function if it's inside a router, 
        # I'll implement a helper in `backend/storage.py` (if it exists) or here.
        
        # Simplified: Register in DB, and assume we have a mechanism to move file.
        # Check `backend/routers/files.py` for upload logic.
        
        file_size = os.path.getsize(downloaded_file)
        
        # 1. Upload to S3 (non-blocking) with User Isolation
        try:
            from backend.s3.client import upload_file_to_s3, BUCKET_NAME
        except ImportError:
            from s3.client import upload_file_to_s3, BUCKET_NAME
            
        # SECURE: User-specific prefix to prevent collision and leakage
        s3_key = f"LazyioMusic/{user.id}/{os.path.basename(downloaded_file)}"
        
        # We need to run the upload in the executor because upload_file_to_s3 might be blocking 
        # (it uses boto3 sync client).
        # Also upload_file_to_s3 takes a file object, not path.
        
        def upload_helper():
            with open(downloaded_file, "rb") as f:
                upload_file_to_s3(f, s3_key)
        
        await loop.run_in_executor(None, upload_helper)
        
        # 2. Create File Record
        new_file = FileModel(
            name=os.path.basename(downloaded_file).replace(f"{task_id}_", ""), # Remove ID prefix
            size=file_size,
            is_folder=False,
            parent_id=music_folder_id,
            user_id=user.id,
            s3_key=s3_key,
            mime_type="audio/mpeg"
        )
        db.add(new_file)
        db.commit()
        db.refresh(new_file)
        
        # 3. Create Music Metadata
        music_meta = MusicMetadata(
            file_id=new_file.id,
            title=task.meta['title'],
            artist=task.meta['artist'],
            album=task.meta['album'],
            duration=task.meta['duration'],
            cover_art=task.thumbnail
        )
        db.add(music_meta)
        db.commit()
        
        task.status = DownloadStatus.COMPLETED
        task.progress = 100

    except Exception as e:
        logger.error(f"Download failed: {e}")
        task.status = DownloadStatus.FAILED
        task.error = str(e)
    finally:
        # CLEANUP: Ensure temp file is removed even on error
        if downloaded_file and os.path.exists(downloaded_file):
            try:
                os.remove(downloaded_file)
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup temp file: {cleanup_error}")

def update_progress(task, d):
    if d['status'] == 'downloading':
        try:
            p = d.get('_percent_str', '0%').replace('%','')
            task.progress = float(p)
        except:
            pass
