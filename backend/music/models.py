from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, BigInteger
from sqlalchemy.orm import relationship
import datetime

try:
    from backend.database import Base
except ImportError:
    from database import Base

class MusicMetadata(Base):
    __tablename__ = "music_metadata"
    
    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id"), unique=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    album = Column(String, index=True)
    genre = Column(String)
    duration = Column(Integer)  # Seconds
    track_number = Column(Integer)
    cover_art = Column(String, nullable=True)  # S3 Key or URL
    
    file = relationship("File", back_populates="music_metadata")

class Playlist(Base):
    __tablename__ = "playlists"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    description = Column(String, nullable=True)
    cover_image = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner = relationship("User", back_populates="playlists")
    songs = relationship("PlaylistSong", back_populates="playlist", cascade="all, delete-orphan")

class PlaylistSong(Base):
    __tablename__ = "playlist_songs"
    
    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"))
    file_id = Column(Integer, ForeignKey("files.id"))
    order = Column(Integer)
    
    playlist = relationship("Playlist", back_populates="songs")
    file = relationship("File")
