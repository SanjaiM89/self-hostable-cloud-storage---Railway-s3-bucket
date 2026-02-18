import os
from mutagen import File
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from shazamio import Shazam
import logging

logger = logging.getLogger(__name__)

async def extract_metadata(file_path: str) -> dict:
    """
    Extracts metadata from a music file using Mutagen.
    Returns dict: {title, artist, album, duration, cover_art}
    """
    metadata = {
        "title": os.path.basename(file_path),
        "artist": "Unknown Artist",
        "album": "Unknown Album",
        "duration": 0,
        "cover_art": None
    }
    
    try:
        audio = File(file_path)
        if not audio:
            return metadata

        # Duration
        if hasattr(audio, 'info') and hasattr(audio.info, 'length'):
            metadata["duration"] = int(audio.info.length)

        # ID3/Tags (Basic)
        if isinstance(audio, MP3) or isinstance(audio, ID3):
             tags = audio.tags
             if tags:
                 if 'TIT2' in tags: metadata["title"] = str(tags['TIT2'])
                 if 'TPE1' in tags: metadata["artist"] = str(tags['TPE1'])
                 if 'TALB' in tags: metadata["album"] = str(tags['TALB'])
        elif isinstance(audio, FLAC):
            if 'title' in audio: metadata["title"] = audio['title'][0]
            if 'artist' in audio: metadata["artist"] = audio['artist'][0]
            if 'album' in audio: metadata["album"] = audio['album'][0]

        # Shazam (Optional, can be slow, maybe trigger in background?)
        # For now, let's skip Shazam in invalid/fast paths to keep it responsive, 
        # or implement a specific "Identify" endpoint.
        
    except Exception as e:
        logger.error(f"Error extracting metadata for {file_path}: {e}")
        
    return metadata
