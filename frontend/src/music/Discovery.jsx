import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/api';
import Loader from '../components/Loader';
import SongContextMenu from './SongContextMenu';
import { Play } from 'lucide-react';

const CACHE_KEY = 'music_discovery_cache';

export default function Discovery() {
    const { playSong } = useOutletContext();
    const [data, setData] = useState({ recommendations: [], ai_playlist_name: "Loading..." });
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        // Load from cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && parsed.recommendations) {
                    setData(parsed);
                    setLoading(false);
                }
            }
        } catch (e) { /* ignore */ }

        try {
            const res = await api.get('/music/recommendations');
            const result = res.data || { recommendations: [], ai_playlist_name: "No Data" };
            setData(result);

            // Update cache
            localStorage.setItem(CACHE_KEY, JSON.stringify(result));
        } catch (err) {
            console.error("Failed to fetch recommendations", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading && (!data?.recommendations || data.recommendations.length === 0)) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-10">
            {/* Header / Intro */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">For You</h1>
                    <p className="text-white/40 mt-1">AI-curated picks based on your listening habits</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/70 transition"
                >
                    Refresh
                </button>
            </div>

            {/* AI Playlist Section */}
            {data?.recommendations?.length > 0 ? (
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">✨</span>
                        <h2 className="text-xl font-semibold">{data.ai_playlist_name}</h2>
                        <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 text-xs border border-pink-500/20">
                            AI Generated
                        </span>
                    </div>

                    <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                        {data.recommendations.map((song, idx) => (
                            <div
                                key={song.id}
                                className="group flex items-center gap-4 p-4 hover:bg-white/5 transition border-b border-white/5 last:border-0"
                            >
                                <span className="w-6 text-center text-white/30 text-sm">{idx + 1}</span>

                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/50 flex-shrink-0">
                                    {song.cover_art ? (
                                        <img src={song.cover_art} className="w-full h-full object-cover" alt={song.title} />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white/20">
                                            <Play size={16} fill="currentColor" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => playSong(song)}
                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <Play size={20} fill="white" className="text-white" />
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-white truncate">{song.title}</h3>
                                    <p className="text-sm text-white/40 truncate">{song.artist}</p>
                                </div>

                                <span className="text-sm text-white/30 hidden sm:block">
                                    {formatDuration(song.duration)}
                                </span>

                                <SongContextMenu song={song} />
                            </div>
                        ))}
                    </div>
                </section>
            ) : (
                <div className="text-center py-20 text-white/30">
                    <p>No recommendations available yet.</p>
                    <p className="text-sm mt-2">Listen to some music to let the AI learn your taste!</p>
                </div>
            )}
        </div>
    );
}
