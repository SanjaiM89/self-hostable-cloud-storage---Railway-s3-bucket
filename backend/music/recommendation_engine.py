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

    def generate_mix(self, db: Session, user_id: int, name: str, strategy: str = "daily"):
        """Generate or update a playlist based on strategy."""
        # Check existing
        existing_mix = db.query(Playlist).filter(
            Playlist.user_id == user_id,
            Playlist.is_generated == True,
            Playlist.name == name
        ).first()

        # Check if fresh ( < 1 hour old)
        if existing_mix and existing_mix.last_updated > datetime.datetime.utcnow() - datetime.timedelta(hours=1):
            return existing_mix

        # Generate Song IDs based on strategy
        final_song_ids = []
        print(f"DEBUG: Generating mix '{name}' with strategy '{strategy}'")
        
        if strategy == "daily":
            # Top songs last 30 days + similar
            thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
            top_songs = db.query(ListenHistory.file_id, func.count(ListenHistory.id).label('count'))\
                .filter(ListenHistory.user_id == user_id, ListenHistory.played_at > thirty_days_ago)\
                .group_by(ListenHistory.file_id)\
                .order_by(desc('count'))\
                .limit(10)\
                .all()
            
            print(f"DEBUG: Strategy daily found {len(top_songs)} top songs")
            
            if top_songs:
                seed_ids = [s[0] for s in top_songs]
                final_song_ids.extend(seed_ids)
                for seed in seed_ids:
                    similar = audio_recommender.find_similar(seed, limit=2)
                    final_song_ids.extend(similar)

        elif strategy == "discovery":
            # Random songs user hasn't played much (or at all)
            # For simplicity: Random from library
            all_files = db.query(MusicMetadata.file_id).all()
            all_ids = [f[0] for f in all_files]
            print(f"DEBUG: Strategy discovery found {len(all_ids)} total songs")
            if all_ids:
                final_song_ids = random.sample(all_ids, min(20, len(all_ids)))

        elif strategy == "quick_picks":
            # Recently played + random favorites
            # Get processed favorites logic or just recent history
            recent = db.query(ListenHistory.file_id)\
                .filter(ListenHistory.user_id == user_id)\
                .order_by(ListenHistory.played_at.desc())\
                .limit(10)\
                .all()
            print(f"DEBUG: Strategy quick_picks found {len(recent)} recent songs")
            
            if recent:
                ids = [r[0] for r in recent]
                final_song_ids.extend(ids)
                # Augmented with random from library to fill up
                all_files = db.query(MusicMetadata.file_id).all()
                all_ids = [f[0] for f in all_files]
                remaining = 20 - len(ids)
                if remaining > 0 and all_ids:
                    final_song_ids.extend(random.sample(all_ids, min(remaining, len(all_ids))))

        # Deduplicate and Shuffle
        final_song_ids = list(set(final_song_ids))
        random.shuffle(final_song_ids)
        final_song_ids = final_song_ids[:25] # Cap at 25

        if not final_song_ids:
            return existing_mix # Return old mix if generation failed (e.g. no history)

        if not existing_mix:
            existing_mix = Playlist(
                user_id=user_id,
                name=name,
                description=f"Fresh {name} for you.",
                is_generated=True,
                cover_image=None 
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

    def generate_all_mixes(self, db: Session, user_id: int):
        """Generate all standard mixes."""
        mixes = []
        
        m1 = self.generate_mix(db, user_id, "Daily Mix", "daily")
        if m1: mixes.append(m1)
        
        m2 = self.generate_mix(db, user_id, "Discovery Mix", "discovery")
        if m2: mixes.append(m2)
        
        m3 = self.generate_mix(db, user_id, "Quick Picks", "quick_picks")
        if m3: mixes.append(m3)
            
        return mixes

recommendation_engine = RecommendationEngine()
