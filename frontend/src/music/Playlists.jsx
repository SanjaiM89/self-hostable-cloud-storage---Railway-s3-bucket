import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Play, Plus, Trash2, Disc, ArrowLeft, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import SongContextMenu from './SongContextMenu';

export default function Playlists() {
    const { playSong } = useOutletContext();
    const [playlists, setPlaylists] = useState([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState(null); // Full object with songs
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadPlaylists();
    }, []);

    const loadPlaylists = async () => {
        try {
            const res = await api.get('/music/playlists');
            setPlaylists(res.data);
        } catch (err) {
            console.error("Failed to load playlists", err);
        }
    };

    const loadPlaylistDetails = async (id) => {
        setLoading(true);
        try {
            const res = await api.get(`/music/playlists/${id}`);
            setSelectedPlaylist(res.data);
        } catch (err) {
            console.error("Failed to load playlist details", err);
        } finally {
            setLoading(false);
        }
    };

    const createPlaylist = async () => {
        if (!newPlaylistName.trim()) return;
        try {
            const res = await api.post('/music/playlists', null, {
                params: { name: newPlaylistName }
            });
            setPlaylists([...playlists, res.data]);
            setNewPlaylistName('');
        } catch (err) {
            console.error("Failed to create playlist", err);
        }
    };

    const removeSong = async (songId) => {
        if (!selectedPlaylist) return;
        if (!window.confirm("Remove this song from the playlist?")) return;

        try {
            await api.delete(`/music/playlists/${selectedPlaylist.id}/songs/${songId}`);
            // Update local state
            setSelectedPlaylist(prev => ({
                ...prev,
                songs: prev.songs.filter(s => s.id !== songId)
            }));
        } catch (err) {
            console.error(err);
        }
    };

    // Format duration helper
    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // --- Playlist Detail View ---
    if (selectedPlaylist) {
        return (
            <div className="p-8 h-full overflow-y-auto">
                <button
                    onClick={() => setSelectedPlaylist(null)}
                    className="flex items-center gap-2 text-white/50 hover:text-white mb-6 transition"
                >
                    <ArrowLeft size={20} /> Back to Playlists
                </button>

                <div className="flex items-end gap-6 mb-8">
                    <div className="w-48 h-48 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-2xl">
                        <Disc size={80} className="text-white/30" />
                    </div>
                    <div>
                        <p className="text-white/60 uppercase tracking-widest text-xs font-bold mb-1">Playlist</p>
                        <h1 className="text-5xl font-bold mb-4 text-white">{selectedPlaylist.name}</h1>
                        <p className="text-white/60">{selectedPlaylist.songs?.length || 0} songs</p>
                    </div>
                </div>

                <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
                    {selectedPlaylist.songs && selectedPlaylist.songs.length > 0 ? (
                        selectedPlaylist.songs.map((song, idx) => (
                            <div
                                key={song.playlist_song_id || song.id} // use unique mapping id if available, else song id
                                className="group flex items-center gap-4 p-4 hover:bg-white/5 transition border-b border-white/5 last:border-0"
                            >
                                <span className="w-6 text-center text-white/30 text-sm">{idx + 1}</span>

                                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-black/50 flex-shrink-0">
                                    {song.cover_art ? (
                                        <img src={song.cover_art} className="w-full h-full object-cover" alt={song.title} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20">
                                            <Play size={12} fill="currentColor" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => playSong(song)}
                                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <Play size={16} fill="white" className="text-white" />
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-white truncate">{song.title}</h3>
                                    <p className="text-sm text-white/40 truncate">{song.artist}</p>
                                </div>

                                <span className="text-sm text-white/30 hidden sm:block">
                                    {formatDuration(song.duration)}
                                </span>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                        onClick={() => removeSong(song.id)}
                                        className="p-2 hover:bg-white/10 rounded-full text-white/30 hover:text-red-400 transition"
                                        title="Remove from playlist"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                    <SongContextMenu song={song} />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-10 text-center text-white/30">
                            This playlist is empty.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- Playlist List View ---
    return (
        <div className="p-8 h-full overflow-y-auto">
            <h1 className="text-3xl font-bold mb-8 text-white">Playlists</h1>

            {/* Create New */}
            <div className="flex gap-4 mb-8 bg-white/5 p-4 rounded-xl border border-white/10 max-w-2xl">
                <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="New Playlist Name"
                    className="flex-1 bg-transparent border-b border-white/20 focus:border-pink-500 outline-none px-2 py-1 text-white placeholder-white/30"
                    onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                />
                <button
                    onClick={createPlaylist}
                    disabled={!newPlaylistName.trim()}
                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                    <Plus size={18} />
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {playlists.map(pl => (
                    <div
                        key={pl.id}
                        className="group bg-white/5 p-4 rounded-xl border border-white/5 hover:border-pink-500/30 hover:bg-white/10 transition cursor-pointer relative"
                        onClick={() => loadPlaylistDetails(pl.id)}
                    >
                        <div className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg mb-4 flex items-center justify-center shadow-lg group-hover:shadow-pink-500/10 transition">
                            <Disc size={40} className="text-white/20 group-hover:text-pink-500 transition" />
                        </div>
                        <h3 className="font-bold text-white truncate">{pl.name}</h3>
                        <p className="text-sm text-white/40">{pl.song_count || "0"} songs</p>

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            <div className="bg-pink-600/90 p-3 rounded-full shadow-xl transform scale-90 group-hover:scale-100 transition">
                                <Play size={24} fill="currentColor" className="text-white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
