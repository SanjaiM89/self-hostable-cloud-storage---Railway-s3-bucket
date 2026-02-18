import os
import httpx
from typing import List, Dict, Optional
import asyncio
import random
from collections import Counter
from sqlalchemy.orm import Session
from .models import MusicMetadata

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "5w4rvCocyO2ZWXDUw974C8BbGdc4MJiB")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

_last_request_time = 0
_api_failures = 0

async def _rate_limit():
    global _last_request_time
    import time
    now = time.time()
    wait_time = max(0, 1.5 - (now - _last_request_time))
    if wait_time > 0:
        await asyncio.sleep(wait_time)
    _last_request_time = time.time()

async def _call_mistral(prompt: str, temperature: float = 0.7) -> str:
    global _api_failures
    await _rate_limit()
    
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "mistral-tiny",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": 200
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(MISTRAL_API_URL, json=payload, headers=headers, timeout=15.0)
            if response.status_code == 200:
                _api_failures = 0
                data = response.json()
                return data["choices"][0]["message"]["content"]
            elif response.status_code == 429:
                _api_failures += 1
                return ""
            else:
                _api_failures += 1
                return ""
    except Exception as e:
        _api_failures += 1
        print(f"Error calling Mistral API: {e}")
        return ""

# ==================== RECOMMENDATION LOGIC ====================

def _calculate_similarity_score(song: MusicMetadata, liked_songs: List[MusicMetadata]) -> float:
    score = 0.0
    
    # 1. Artist Similarity
    song_artist = (song.artist or "").lower()
    liked_artists = Counter([(s.artist or "").lower() for s in liked_songs])
    
    if song_artist in liked_artists:
        score += 30 * liked_artists[song_artist]
    
    # 2. Album Similarity
    song_album = (song.album or "").lower()
    liked_albums = Counter([(s.album or "").lower() for s in liked_songs])
    
    if song_album in liked_albums and song_album != "youtube":
        score += 15 * liked_albums[song_album]
        
    return score

def _fallback_recommendations(
    current_song: Optional[MusicMetadata], 
    liked_songs: List[MusicMetadata], 
    all_songs: List[MusicMetadata],
    limit: int = 10
) -> List[MusicMetadata]:
    """Fallback algorithm when LLM is unavailable"""
    
    exclude_ids = {s.id for s in liked_songs}
    if current_song:
        exclude_ids.add(current_song.id)
    
    candidates = [s for s in all_songs if s.id not in exclude_ids]
    
    if not candidates:
        return []
        
    if not liked_songs and current_song:
        liked_songs = [current_song]
    
    scored = []
    for song in candidates:
        score = _calculate_similarity_score(song, liked_songs)
        scored.append((song, score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scored[:limit]]

async def get_music_recommendations(
    current_song: MusicMetadata, 
    history: List[MusicMetadata], 
    all_songs: List[MusicMetadata]
) -> List[MusicMetadata]:
    """Get recommendations using Mistral or fallback"""
    global _api_failures
    
    if _api_failures >= 3:
        return _fallback_recommendations(current_song, history, all_songs, limit=5)
    
    history_str = "\n".join([f"- {s.title} by {s.artist}" for s in history[-5:]])
    current_str = f"{current_song.title} by {current_song.artist}"
    
    prompt = f"""I am listening to: {current_str}
My recent songs:
{history_str}

Recommend 5 similar songs. Return ONLY "Title - Artist" format, one per line."""

    content = await _call_mistral(prompt)
    if content:
        # Match returned strings to actual DB songs
        recommendations = []
        for line in content.split("\n"):
            line = line.strip().lower()
            if " - " in line:
                # Fuzzy match in all_songs
                parts = line.split(" - ")
                title_query = parts[0].strip()
                
                # Simple exact match on title substring
                match = next((s for s in all_songs if title_query in (s.title or "").lower()), None)
                if match and match not in recommendations and match.id != current_song.id:
                    recommendations.append(match)
        
        if recommendations:
            return recommendations[:5]
            
    return _fallback_recommendations(current_song, history, all_songs, limit=5)

async def generate_ai_playlist_name(songs: List[MusicMetadata]) -> str:
    """Generate a creative name for a list of songs"""
    song_list = ", ".join([f"{s.title}" for s in songs[:5]])
    prompt = f"Create a short, creative playlist name (max 3 words) for a mix containing: {song_list}. Return ONLY the name."
    
    name = await _call_mistral(prompt, temperature=0.9)
    if name:
        return name.strip().strip('"')
    return "AI Mix"
