import os
import ffmpeg
import logging
from sqlalchemy.orm import Session
try:
    from backend.models import File as FileModel, User
    from backend.music.models import MusicMetadata
except ImportError:
    from models import File as FileModel, User
    from music.models import MusicMetadata

logger = logging.getLogger(__name__)

def extract_audio_from_video(video_path: str, output_path: str) -> bool:
    """
    Extract MP3 audio from video file using ffmpeg.
    """
    try:
        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            return False
            
        stream = ffmpeg.input(video_path)
        stream = ffmpeg.output(stream, output_path, acodec='libmp3lame', qscale=2, loglevel="error")
        ffmpeg.run(stream, overwrite_output=True)
        return True
    except ffmpeg.Error as e:
        logger.error(f"FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}")
        return False
    except Exception as e:
        logger.error(f"Extraction failed: {str(e)}")
        return False

def handle_video_upload(file_id: int, db: Session):
    """
    Background task to extract audio from uploaded video.
    """
    try:
        file_model = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file_model:
            return

        # Check if it's a video
        if not file_model.name.lower().endswith(('.mp4', '.mkv', '.webm', '.avi', '.mov')):
            return
            
        logger.info(f"Video upload detected: {file_model.name}. Queueing audio extraction (Not fully implemented for S3).")
        
        # S3 Logic placeholder:
        # 1. download_file_from_s3(file_model.s3_key, temp_path)
        # 2. extract_audio(temp_path, output_mp3)
        # 3. upload_file_to_s3(output_mp3, "LazyioMusic/Extracted/...")
        # 4. Create FileModel and MusicMetadata
        
    except Exception as e:
        logger.error(f"Error in video analysis: {e}")
