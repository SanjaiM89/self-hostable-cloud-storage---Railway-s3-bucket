import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2, Music, Shuffle, Repeat, Heart } from 'lucide-react';
import api from '../utils/api';

export default function Player({ currentSong, isPlaying, onTogglePlay, audioRef, onNext, onPrev }) {
    const [volume, setVolume] = useState(1);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFavorite, setIsFavorite] = useState(false);

    // Sync volume with audio ref
    useEffect(() => {
        if (audioRef && audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume, audioRef]);

    // Check favorite status when song changes
    useEffect(() => {
        if (currentSong) {
            checkFavoriteStatus();
        }
    }, [currentSong]);

    const checkFavoriteStatus = async () => {
        try {
            // This is inefficient (fetching all favorites to check one). 
            // Better API would be GET /music/favorites/check/{id} or return is_favorite in song object.
            // For now, let's just fetch all favorites and check.
            const res = await api.get('/music/favorites');
            const favs = res.data;
            setIsFavorite(favs.some(f => f.id === currentSong.id));
        } catch (e) {
            console.error(e);
        }
    };

    const toggleFavorite = async () => {
        if (!currentSong) return;
        try {
            if (isFavorite) {
                await api.delete(`/music/favorites/${currentSong.id}`);
                setIsFavorite(false);
            } else {
                await api.post(`/music/favorites/${currentSong.id}`);
                setIsFavorite(true);
            }
        } catch (e) {
            console.error("Failed to toggle favorite", e);
        }
    };

    // Handle time updates
    useEffect(() => {
        if (!audioRef || !audioRef.current) return;
        const audio = audioRef.current;

        const updateTime = () => {
            setProgress(audio.currentTime);
            setDuration(audio.duration || 0);
        };

        audio.addEventListener('timeupdate', updateTime);
        return () => audio.removeEventListener('timeupdate', updateTime);
    }, [audioRef]);

    const formatTime = (time) => {
        if (!time) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    if (!currentSong) {
        return (
            <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-color)] p-3 flex items-center justify-between h-20 shadow-lg backdrop-blur-md bg-opacity-95 text-[var(--text-secondary)]">
                <div className="w-1/4"></div>
                <div className="text-sm">Select a song to play</div>
                <div className="w-1/4"></div>
            </div>
        );
    }

    return (
        <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-color)] p-3 flex items-center justify-between h-20 shadow-lg backdrop-blur-md bg-opacity-95 z-50 relative">
            {/* Song Info */}
            <div className="flex items-center w-1/4 min-w-0 gap-3">
                <div className="w-12 h-12 rounded bg-gray-700 overflow-hidden flex-shrink-0 relative group">
                    {currentSong.cover_art ? (
                        <img src={currentSong.cover_art} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            <Music size={20} />
                        </div>
                    )}
                </div>
                <div className="truncate flex-1">
                    <div className="text-sm font-semibold truncate text-[var(--text-primary)]">{currentSong.title}</div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">{currentSong.artist}</div>
                </div>
                <button
                    onClick={toggleFavorite}
                    className={`p-1.5 rounded-full hover:bg-[var(--bg-hover)] transition ${isFavorite ? 'text-red-500' : 'text-[var(--text-secondary)]'}`}
                >
                    <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
                </button>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center w-2/4 px-2">
                <div className="flex items-center gap-4 mb-1">
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Shuffle size={16} /></button>
                    <button className="text-[var(--text-primary)] hover:text-[var(--accent)]" onClick={onPrev}><SkipBack size={20} fill="currentColor" /></button>
                    <button
                        className="w-10 h-10 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center hover:scale-105 transition hover:bg-[var(--accent)] hover:text-white"
                        onClick={onTogglePlay}
                    >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                    </button>
                    <button className="text-[var(--text-primary)] hover:text-[var(--accent)]" onClick={onNext}><SkipForward size={20} fill="currentColor" /></button>
                    <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Repeat size={16} /></button>
                </div>

                <div className="w-full flex items-center gap-2 text-xs text-[var(--text-secondary)] px-4">
                    <span>{formatTime(progress)}</span>
                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="0.1"
                        value={progress}
                        className="flex-1 h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                        onChange={(e) => {
                            const val = Number(e.target.value);
                            if (audioRef.current) audioRef.current.currentTime = val;
                            setProgress(val);
                        }}
                    />
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Volume & Extras */}
            <div className="flex items-center justify-end w-1/4 gap-3">
                <Volume2 size={18} className="text-[var(--text-secondary)]" />
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    className="w-20 h-1 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    onChange={(e) => setVolume(Number(e.target.value))}
                />
                <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Maximize2 size={18} /></button>
            </div>
        </div>
    );
}
