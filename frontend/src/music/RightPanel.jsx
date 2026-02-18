import { useState, useEffect } from 'react';
import { Music, Play, Plus, Disc } from 'lucide-react';
import api from '../utils/api';

export default function RightPanel({ currentSong, isPlaying, onTogglePlay }) {
    const [recommended, setRecommended] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRecommendations();
    }, []);

    const fetchRecommendations = async () => {
        try {
            setLoading(true);
            const res = await api.get('/music/playlists/recommended');
            setRecommended(res.data);
        } catch (error) {
            console.error("Failed to fetch recommendations", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToLibrary = async (playlistId) => {
        // Placeholder for adding to library
        // await api.post(`/music/playlists/save/${playlistId}`);
        alert("Playlist saved to library! (Placeholder)");
    };

    return (
        <div className="w-80 flex-shrink-0 h-full bg-[var(--sidebar-bg)] border-l border-[var(--border-color)] p-6 flex flex-col overflow-y-auto">
            {/* Recommended Playlists Header */}
            <div className="mb-4 flex justify-between items-end">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">For You</h3>
                <button
                    onClick={fetchRecommendations}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition"
                >
                    Refresh
                </button>
            </div>

            {/* Content */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-sm text-[var(--text-secondary)] animate-pulse">Generating your mix...</div>
                ) : recommended.length > 0 ? (
                    recommended.map(playlist => (
                        <div key={playlist.id} className="group relative bg-[var(--card-bg)] rounded-xl p-3 border border-transparent hover:border-[var(--border-color)] transition-all hover:shadow-lg hover:shadow-[var(--accent)]/5">
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center text-white shadow-md">
                                    <Disc size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{playlist.name}</h4>
                                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">{playlist.description}</p>
                                    <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
                                        {new Date(playlist.last_updated).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>

                            {/* Hover Action */}
                            <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="text-[10px] text-[var(--text-secondary)]">
                                    {playlist.songs?.length || 0} Songs
                                </div>
                                <button
                                    onClick={() => handleAddToLibrary(playlist.id)}
                                    className="p-1.5 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition"
                                    title="Add to Library"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center opacity-60">
                        <Music size={40} className="text-[var(--text-tertiary)] mb-3" />
                        <p className="text-sm text-[var(--text-primary)] font-medium">No Mixes Yet</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-[200px]">
                            Keep listening to music to get personalized Daily Mixes generated just for you.
                        </p>
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="mt-auto pt-8">
                <div className="bg-[var(--bg-tertiary)] rounded-xl p-4 border border-[var(--border-color)]">
                    <h5 className="font-bold text-xs text-[var(--text-primary)] mb-1">How it works</h5>
                    <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                        We analyze your listening history to create custom playlists. New mixes appear here every few hours.
                    </p>
                </div>
            </div>
        </div>
    );
}
