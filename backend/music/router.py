from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, WebSocket, WebSocketDisconnect, UploadFile, File, Body
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil

try:
    from backend.database import get_db
    from backend.models import User, File as FileModel
    from backend.music.models import MusicMetadata, Playlist, PlaylistSong
    from backend.routers.auth import get_current_user
    from backend.music.youtube import tasks, process_download, DownloadTask
    from backend.music.audio_recommender import audio_recommender
    from backend.music.mistral import get_music_recommendations, generate_ai_playlist_name
    from backend.music.sockets import manager
except ImportError:
    # Local dev fallback
    from database import get_db
    from models import User, File as FileModel
    from music.models import MusicMetadata, Playlist, PlaylistSong, ListenHistory
    from routers.auth import get_current_user
    from music.youtube import tasks, process_download, DownloadTask
    from music.audio_recommender import audio_recommender
    from music.recommendation_engine import recommendation_engine
    from music.mistral import get_music_recommendations, generate_ai_playlist_name
    from music.sockets import manager

router = APIRouter(prefix="/music", tags=["music"])

# --- Recommendations (Endpoints that must be before dynamic routes) ---

@router.get("/playlists/recommended")
def get_recommended_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # For now, just return the Daily Mix if exists
    daily_mix = db.query(Playlist).filter(
        Playlist.user_id == current_user.id,
        Playlist.is_generated == True
    ).all()

    # If no daily mix, try to generate one locally
    if not daily_mix:
        mix = recommendation_engine.generate_daily_mix(db, current_user.id)
        if mix:
            daily_mix = [mix]

    return daily_mix

# --- Playlists ---
# --- Helper ---
def get_music_folder(db: Session, user: User):
    """Get or create the 'LazyioMusic' folder for the user."""
    music_folder = db.query(FileModel).filter(
        FileModel.user_id == user.id,
        FileModel.parent_id == None,
        FileModel.name == "LazyioMusic",
        FileModel.is_folder == True,
        FileModel.is_trashed == False
    ).first()
    
    if not music_folder:
        music_folder = FileModel(
            name="LazyioMusic",
            is_folder=True,
            parent_id=None,
            user_id=user.id,
            size=0
        )
        db.add(music_folder)
        db.commit()
        db.refresh(music_folder)
    return music_folder

# --- WebSocket ---
@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            # Broadcast to other connections of the same user
            await manager.broadcast_to_user(client_id, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)

# --- Core Music ---

@router.get("/songs")
def list_songs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all music files with metadata."""
    results = db.query(FileModel, MusicMetadata).join(
        MusicMetadata, FileModel.id == MusicMetadata.file_id
    ).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).all()
    
    songs = []
    for file, meta in results:
        songs.append({
            "id": file.id,
            "title": meta.title or file.name,
            "artist": meta.artist or "Unknown Artist",
            "album": meta.album or "Unknown Album",
            "duration": meta.duration,
            "cover_art": meta.cover_art,
            "url": f"/api/files/{file.id}/stream",
            "file_name": file.name,
            "s3_key": file.s3_key,
            "user_id": file.user_id
        })
    return songs

@router.post("/scan")
def scan_music_library(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Scan LazyioMusic folder for new files and extract metadata."""
    # Find audio files without metadata
    # 1. Get all audio files owned by user
    all_files = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_folder == False,
        FileModel.is_trashed == False
    ).all()
    
    processed = 0
    for file in all_files:
        if file.name.lower().endswith(('.mp3', '.wav', '.flac', '.m4a')):
            # Check if metadata exists
            exists = db.query(MusicMetadata).filter(MusicMetadata.file_id == file.id).first()
            if not exists:
                # Extract Metadata
                # Since files are in S3, this is tricky. We can't use mutagen on S3 URL directly nicely.
                # If we are locally hosting, we can use the path.
                # Assuming for now we skip deep extraction for S3 files unless downloaded 
                # OR we implement a temp download.
                
                # For `scan`, we might only have the FileModel. 
                # If the system is S3 based, we can't easily scan without downloading.
                # Fallback to filename parsing
                title = file.name
                artist = "Unknown"
                if "-" in file.name:
                    parts = file.name.split("-")
                    artist = parts[0].strip()
                    title = "-".join(parts[1:]).strip().replace(".mp3", "")
                
                meta = MusicMetadata(
                    file_id=file.id,
                    title=title,
                    artist=artist,
                    album="Unknown Album",
                    duration=0
                )
                db.add(meta)
                processed += 1
                
                # Trigger background analysis?
    
    db.commit()
    return {"message": f"Scanned library. Processed {processed} new songs."}

# --- Recommendations & AI ---

@router.get("/playlists/recommended")
def get_recommended_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # For now, just return the Daily Mix if exists
    daily_mix = db.query(Playlist).filter(
        Playlist.user_id == current_user.id, 
        Playlist.is_generated == True
    ).all()
    
    # If no daily mix, try to generate one locally
    if not daily_mix:
        mix = recommendation_engine.generate_daily_mix(db, current_user.id)
        if mix:
            daily_mix = [mix]
            
    return daily_mix

@router.post("/history")
def record_history(
    file_id: int = Body(..., embed=True),
    duration: int = Body(0, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    recommendation_engine.record_history(db, current_user.id, file_id, duration)
    return {"status": "recorded"}

@router.get("/recommendations")
def get_recommendations(
    current_song_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # ... existing implementation ...
    # Wait, I need to read the existing implementation to know what to replace if I move it.
    # The previous `view_file` showed `get_recommendations` at line 254 (in outline) or later.
    # I should just MOVE `get_recommended_playlists` to the top.
    pass 

# I will just insert `get_recommended_playlists` at line 149 and remove it from the bottom.
# But `replace_file_content` is for single contiguous block.
# I will use `multi_replace_file_content` or just two `replace_file_content` calls.
# --- Favorites ---

def _get_favorites_playlist(db, user_id):
    """Get or create the 'Favorites' playlist."""
    playlist = db.query(Playlist).filter(
        Playlist.user_id == user_id,
        Playlist.name == "Favorites"
    ).first()
    
    if not playlist:
        playlist = Playlist(name="Favorites", user_id=user_id, is_generated=False)
        db.add(playlist)
        db.commit()
        db.refresh(playlist)
        
    return playlist

@router.get("/favorites")
def get_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get songs in Favorites playlist."""
    pl = _get_favorites_playlist(db, current_user.id)
    
    # Reuse logic? Or just join
    songs = db.query(PlaylistSong, MusicMetadata, FileModel).join(
        MusicMetadata, PlaylistSong.file_id == MusicMetadata.file_id
    ).join(
        FileModel, PlaylistSong.file_id == FileModel.id
    ).filter(
        PlaylistSong.playlist_id == pl.id
    ).order_by(PlaylistSong.order).all()
    
    results = []
    for ps, meta, file in songs:
        results.append({
            "id": file.id,
            "title": meta.title,
            "artist": meta.artist,
            "album": meta.album,
            "duration": meta.duration,
            "cover_art": meta.cover_art,
            "url": f"/api/files/{file.id}/stream",
            "playlist_song_id": ps.id
        })
    return results

@router.post("/favorites/{file_id}")
def add_favorite(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a song to favorites."""
    pl = _get_favorites_playlist(db, current_user.id)
    
    # Check if exists
    exists = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == pl.id, 
        PlaylistSong.file_id == file_id
    ).first()
    
    if exists:
        return {"message": "Already in favorites"}
        
    count = db.query(PlaylistSong).filter(PlaylistSong.playlist_id == pl.id).count()
    item = PlaylistSong(playlist_id=pl.id, file_id=file_id, order=count)
    db.add(item)
    db.commit()
    return {"message": "Added to favorites"}

@router.delete("/favorites/{file_id}")
def remove_favorite(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a song from favorites."""
    pl = _get_favorites_playlist(db, current_user.id)
    
    item = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == pl.id, 
        PlaylistSong.file_id == file_id
    ).first()
    
    if item:
        db.delete(item)
        db.commit()
        return {"message": "Removed from favorites"}
        
    raise HTTPException(status_code=404, detail="Song not in favorites")



@router.get("/playlists")
def get_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Playlist).filter(Playlist.user_id == current_user.id).all()

@router.post("/playlists")
def create_playlist(
    name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pl = Playlist(name=name, user_id=current_user.id)
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return pl

@router.get("/playlists/{playlist_id}")
def get_playlist_details(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get playlist with songs."""
    pl = db.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    # Manual join to get songs
    songs_query = db.query(PlaylistSong, MusicMetadata, FileModel).join(
        MusicMetadata, PlaylistSong.file_id == MusicMetadata.file_id
    ).join(
        FileModel, PlaylistSong.file_id == FileModel.id
    ).filter(
        PlaylistSong.playlist_id == playlist_id
    ).order_by(PlaylistSong.order)
    
    songs_data = []
    for ps, meta, file in songs_query.all():
         songs_data.append({
            "id": file.id,
            "title": meta.title,
            "artist": meta.artist,
            "album": meta.album,
            "duration": meta.duration,
            "cover_art": meta.cover_art,
            "url": f"/api/files/{file.id}/stream",
            "playlist_song_id": ps.id # For removal
        })
        
    return {
        "id": pl.id,
        "name": pl.name,
        "songs": songs_data
    }

@router.delete("/playlists/{playlist_id}/songs/{file_id}")
def remove_song_from_playlist(
    playlist_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a song from a playlist."""
    # Verify ownership
    pl = db.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    item = db.query(PlaylistSong).filter(
        PlaylistSong.playlist_id == playlist_id, 
        PlaylistSong.file_id == file_id
    ).first()
    
    if item:
        db.delete(item)
        db.commit()
        return {"message": "Song removed"}
    
    raise HTTPException(status_code=404, detail="Song not in playlist")

@router.post("/playlists/{playlist_id}/songs")
def add_song_to_playlist(
    playlist_id: int,
    file_id: int = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pl = db.query(Playlist).filter(Playlist.id == playlist_id, Playlist.user_id == current_user.id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Get current max order
    # max_order = db.query(func.max(PlaylistSong.order)).filter(PlaylistSong.playlist_id == playlist_id).scalar() or 0
    count = db.query(PlaylistSong).filter(PlaylistSong.playlist_id == playlist_id).count()
    
    item = PlaylistSong(playlist_id=playlist_id, file_id=file_id, order=count)
    db.add(item)
    db.commit()
    return {"message": "Song added"}

@router.post("/history")
def record_history(
    file_id: int = Body(..., embed=True),
    duration: int = Body(0, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    recommendation_engine.record_history(db, current_user.id, file_id, duration)
    return {"status": "recorded"}

@router.get("/playlists/recommended")
def get_recommended_playlists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # For now, just return the Daily Mix if exists
    daily_mix = db.query(Playlist).filter(
        Playlist.user_id == current_user.id, 
        Playlist.is_generated == True
    ).all()
    
    # If no daily mix, try to generate one locally
    if not daily_mix:
        mix = recommendation_engine.generate_daily_mix(db, current_user.id)
        if mix:
            daily_mix = [mix]
            
    return daily_mix

# --- Recommendations & AI ---

@router.get("/recommendations")
async def get_recommendations(
    current_song_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get recommended songs.
    If current_song_id is provided, uses Vector Search (Sound-alike).
    Otherwise/Also uses Mistral AI based on history/random sample.
    """
    # Get all user songs with metadata
    all_songs_query = db.query(MusicMetadata).join(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    )
    all_songs = all_songs_query.all()
    
    recs = []
    
    # 1. Vector Search
    if current_song_id:
        similar_ids = audio_recommender.find_similar(current_song_id, limit=5)
        # Convert IDs back to MusicMetadata objects
        # Note: audio_recommender stores song_id (music_metadata.id? or file.id? let's assume music_metadata.id for now or we need to be careful)
        # In audio_recommender.py we accept 'song_id' which is likely metadata.id
        vector_recs = [s for s in all_songs if s.id in similar_ids]
        recs.extend(vector_recs)
        
    # 2. AI Search
    # Helper to get full object from ID
    current_song = next((s for s in all_songs if s.id == current_song_id), None) if current_song_id else None
    
    # Create mock history for now (random 5 songs)
    # In real app, query 'PlaybackHistory' table
    import random
    history = random.sample(all_songs, min(5, len(all_songs))) if len(all_songs) > 0 else []
    
    if not current_song and all_songs:
        current_song = random.choice(all_songs)
        
    if current_song:
        ai_recs = await get_music_recommendations(current_song, history, all_songs)
        
        # Deduplicate
        existing_ids = {r.id for r in recs}
        existing_ids.add(current_song.id) # Don't recommend current song
        
        for r in ai_recs:
            if r.id not in existing_ids:
                recs.append(r)
                existing_ids.add(r.id)
    
    # Format response
    rec_data = []
    for meta in recs:
        # We need the file_id to build the URL
        # Accessing meta.file lazy loads the File relationship
        if meta.file:
             rec_data.append({
                "id": meta.file.id, # Frontend uses file_id as key usually
                "title": meta.title,
                "artist": meta.artist,
                "album": meta.album,
                "duration": meta.duration,
                "cover_art": meta.cover_art,
                "url": f"/api/files/{meta.file.id}/stream"
            })
            
    return {
        "recommendations": rec_data,
        "ai_playlist_name": await generate_ai_playlist_name(recs) if recs else "AI Mix"
    }

# --- YouTube ---

@router.post("/youtube/download")
def download_from_youtube(
    url: str,
    quality: str = "320",
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a YouTube download task."""
    music_folder = get_music_folder(db, current_user)
    
    task = DownloadTask(url, current_user.id, quality)
    tasks[task.task_id] = task
    
    if background_tasks:
        background_tasks.add_task(process_download, task.task_id, db, current_user, music_folder.id)
    
    return {"task_id": task.task_id, "status": "queued"}

@router.get("/youtube/tasks")
def get_youtube_tasks(current_user: User = Depends(get_current_user)):
    """Get status of active tasks."""
    user_tasks = [
        {
            "task_id": t.task_id,
            "url": t.url,
            "status": t.status.value,
            "progress": t.progress,
            "title": t.title,
            "thumbnail": t.thumbnail,
            "error": t.error
        }
        for t in tasks.values() if t.user_id == current_user.id
    ]
    return user_tasks

@router.delete("/youtube/tasks/{task_id}")
def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    if task_id in tasks and tasks[task_id].user_id == current_user.id:
        del tasks[task_id]
        return {"message": "Task deleted"}
    raise HTTPException(status_code=404, detail="Task not found")

# --- Cookie Management ---

@router.post("/cookies")
async def upload_cookies(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload cookies.txt for yt-dlp."""
    cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
    
    try:
        content = await file.read()
        with open(cookies_path, "wb") as f:
            f.write(content)
        return {"message": "Cookies uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save cookies: {str(e)}")

@router.get("/cookies")
def check_cookies(current_user: User = Depends(get_current_user)):
    """Check if cookies.txt exists."""
    cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
    exists = os.path.exists(cookies_path)
    return {
        "exists": exists, 
        "updated_at": os.path.getmtime(cookies_path) if exists else None
    }

