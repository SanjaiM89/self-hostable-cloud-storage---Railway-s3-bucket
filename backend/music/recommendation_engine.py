from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from .models import ListenHistory, Playlist, PlaylistSong, MusicMetadata
from .audio_recommender import audio_recommender
import datetime
import random

class RecommendationEngine:
    def __init__(self):
        pass

    def record_history(self, db: Session, user_id: int, file_id: int, duration: int = 0):
        """Record a listening event."""
        # Check if recently played (debounce)
        recent = db.query(ListenHistory).filter(
            ListenHistory.user_id == user_id,
            ListenHistory.file_id == file_id,
            ListenHistory.played_at > datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
        ).first()

        if recent:
            # Update duration
            recent.duration_played += duration
            recent.played_at = datetime.datetime.utcnow() # Bump timestamp
        else:
            history = ListenHistory(
                user_id=user_id,
                file_id=file_id,
                played_at=datetime.datetime.utcnow(),
                duration_played=duration
            )
            db.add(history)
        
        db.commit()

        # Trigger lazy playlist generation (approx every 5th play or so to save resources, or just always check strict time)
        # For now, let's just trigger it.
        self.generate_daily_mix(db, user_id)

    def generate_daily_mix(self, db: Session, user_id: int):
        """Generate or update 'Daily Mix' playlists."""
        # Check if we have a Daily Mix generated recently (e.g., in the last hour)
        existing_mix = db.query(Playlist).filter(
            Playlist.user_id == user_id,
            Playlist.is_generated == True,
            Playlist.name.like("Daily Mix%")
        ).first()

        if existing_mix and existing_mix.last_updated > datetime.datetime.utcnow() - datetime.timedelta(hours=1):
            return existing_mix

        # Generate new mix
        # 1. Get top listened songs in last 30 days
        thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
        top_songs = db.query(ListenHistory.file_id, func.count(ListenHistory.id).label('count'))\
            .filter(ListenHistory.user_id == user_id, ListenHistory.played_at > thirty_days_ago)\
            .group_by(ListenHistory.file_id)\
            .order_by(desc('count'))\
            .limit(10)\
            .all()

        if not top_songs:
            return None

        # 2. Get recommendations based on these songs (Content-Based Filtering via AudioRecommender)
        seed_ids = [s[0] for s in top_songs]
        recommended_ids = set()
        
        # Add seeds themselves
        for seed in seed_ids:
            recommended_ids.add(seed)

        # Find similar
        for seed in seed_ids:
            similar = audio_recommender.find_similar(seed, limit=3)
            recommended_ids.update(similar)

        # 3. Create/Update Playlist
        final_song_ids = list(recommended_ids)
        random.shuffle(final_song_ids)
        final_song_ids = final_song_ids[:20] # Limit to 20 songs

        if not existing_mix:
            existing_mix = Playlist(
                user_id=user_id,
                name=f"Daily Mix",
                description="Generated based on your listening history.",
                is_generated=True,
                cover_image=None # Frontend will handle default cover
            )
            db.add(existing_mix)
            db.commit()
            db.refresh(existing_mix)
        else:
            # Clear old songs
            db.query(PlaylistSong).filter(PlaylistSong.playlist_id == existing_mix.id).delete()
            existing_mix.last_updated = datetime.datetime.utcnow()

        # Add new songs
        for idx, file_id in enumerate(final_song_ids):
            ps = PlaylistSong(
                playlist_id=existing_mix.id,
                file_id=file_id,
                order=idx
            )
            db.add(ps)
        
        db.commit()
        return existing_mix

recommendation_engine = RecommendationEngine()
