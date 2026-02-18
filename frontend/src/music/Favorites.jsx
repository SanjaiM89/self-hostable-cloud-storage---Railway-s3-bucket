import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/api';
import Loader from '../components/Loader';
import { Play, Heart, Music, RefreshCw } from 'lucide-react';
import SongContextMenu from './SongContextMenu';

export default function Favorites() {
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const { playSong } = useOutletContext();

    // We can reuse the Add to Playlist modal if we want, but sticking to basics first.
    // For now, let's keep it simple.

    const fetchData = async () => {
        try {
            const res = await api.get('/music/favorites');
            setSongs(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRemove = async (fileId) => {
        try {
            await api.delete(`/music/favorites/${fileId}`);
            setSongs(prev => prev.filter(s => s.id !== fileId));
        } catch (e) {
            console.error("Failed to remove favorite", e);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-full"><Loader /></div>;

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex gap-4 items-center">
                    <div className="p-3 bg-red-500/10 rounded-xl">
                        <Heart className="text-red-500" size={32} fill="currentColor" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Favorites</h1>
                        <p className="text-[var(--text-secondary)]">{songs.length} songs</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={fetchData}
                        className="bg-[var(--bg-secondary)] text-[var(--text-primary)] px-4 py-2 rounded-full font-semibold flex items-center gap-2 hover:bg-[var(--bg-hover)] transition border border-[var(--border-color)]"
                    >
                        <RefreshCw size={18} /> Refresh
                    </button>
                    {songs.length > 0 && (
                        <button
                            onClick={() => playSong(songs[0])}
                            className="bg-[var(--accent)] text-black px-6 py-2 rounded-full font-semibold flex items-center gap-2 hover:opacity-90 transition shadow-lg shadow-[var(--accent)]/20"
                        >
                            <Play size={18} fill="currentColor" /> Play All
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {songs.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-[var(--text-secondary)]">
                        <Heart size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No favorites yet.</p>
                        <p className="text-sm mt-2 opacity-70">Click the heart icon on any song to add it here.</p>
                    </div>
                ) : (
                    songs.map(song => (
                        <div
                            key={song.id}
                            className="group p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition cursor-pointer relative"
                        >
                            <div
                                className="aspect-square rounded-lg bg-[var(--bg-primary)] mb-4 relative overflow-hidden shadow-md"
                                onClick={() => playSong(song)}
                            >
                                {song.cover_art ? (
                                    <img src={song.cover_art} alt={song.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                                        <Music size={40} />
                                    </div>
                                )}
                                {/* Play Overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                    <button className="w-12 h-12 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition">
                                        <Play size={24} fill="currentColor" className="ml-1" />
                                    </button>
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemove(song.id); }}
                                        className="p-2 bg-black/60 rounded-full text-red-500 hover:bg-white hover:text-red-600 transition"
                                        title="Remove from favorites"
                                    >
                                        <Heart size={16} fill="currentColor" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-between items-start">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold truncate text-[var(--text-primary)]">{song.title}</div>
                                    <div className="text-sm text-[var(--text-secondary)] truncate">{song.artist}</div>
                                </div>
                                {/* Context Menu could go here if needed, but simple remove button on hover is nice */}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
