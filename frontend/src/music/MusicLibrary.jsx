import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Loader from '../components/Loader';
import { Play, Plus, Music, RefreshCw, List, Grid, MoreVertical, X } from 'lucide-react';
import SongContextMenu from './SongContextMenu';

export default function MusicLibrary() {
    const [songs, setSongs] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('songs'); // 'songs' | 'playlists'
    const { playSong } = useOutletContext();

    // Modals
    const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [showAddToPlaylist, setShowAddToPlaylist] = useState(null); // song object to add

    const CACHE_KEY = 'music_library_cache';

    const fetchData = async () => {
        // Load from cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { songs: cachedSongs, playlists: cachedPlaylists } = JSON.parse(cached);
                if (cachedSongs) setSongs(cachedSongs);
                if (cachedPlaylists) setPlaylists(cachedPlaylists);
                setLoading(false);
            }
        } catch (e) { /* ignore */ }

        try {
            const [songsRes, playlistsRes] = await Promise.all([
                api.get('/music/songs'),
                api.get('/music/playlists')
            ]);
            setSongs(songsRes.data);
            setPlaylists(playlistsRes.data);

            // Update cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                songs: songsRes.data,
                playlists: playlistsRes.data
            }));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleScan = async () => {
        try {
            setLoading(true);
            await api.post('/music/scan');
            fetchData();
        } catch (e) {
            console.error("Scan failed", e);
            setLoading(false);
        }
    };

    const createPlaylist = async () => {
        if (!newPlaylistName.trim()) return;
        try {
            await api.post('/music/playlists', null, { params: { name: newPlaylistName } });
            setNewPlaylistName('');
            setShowCreatePlaylist(false);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const addToPlaylist = async (playlistId) => {
        if (!showAddToPlaylist) return;
        try {
            await api.post(`/music/playlists/${playlistId}/songs`, null, {
                params: { file_id: showAddToPlaylist.id }
            });
            setShowAddToPlaylist(null);
            alert("Added to playlist");
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-full"><Loader /></div>;

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex gap-4 items-center">
                    <h1 className="text-3xl font-bold">Library</h1>
                    <div className="bg-[var(--bg-secondary)] p-1 rounded-lg flex border border-[var(--border-color)]">
                        <button
                            onClick={() => setActiveTab('songs')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'songs' ? 'bg-[var(--bg-primary)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            Songs
                        </button>
                        <button
                            onClick={() => setActiveTab('playlists')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'playlists' ? 'bg-[var(--bg-primary)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            Playlists
                        </button>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleScan}
                        className="bg-[var(--bg-secondary)] text-[var(--text-primary)] px-4 py-2 rounded-full font-semibold flex items-center gap-2 hover:bg-[var(--bg-hover)] transition border border-[var(--border-color)]"
                    >
                        <RefreshCw size={18} /> Scan
                    </button>
                    {activeTab === 'playlists' && (
                        <button
                            onClick={() => setShowCreatePlaylist(true)}
                            className="bg-[var(--accent)] text-black px-4 py-2 rounded-full font-semibold flex items-center gap-2 hover:opacity-90 transition"
                        >
                            <Plus size={18} /> New Playlist
                        </button>
                    )}
                </div>
            </div>

            {/* Songs View */}
            {activeTab === 'songs' && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {songs.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-[var(--text-secondary)]">
                            <Music size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No music found.</p>
                            <button onClick={handleScan} className="mt-4 text-[var(--accent)] underline">Scan Library</button>
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
                                </div>
                                <div className="flex justify-between items-start">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold truncate text-[var(--text-primary)]">{song.title}</div>
                                        <div className="text-sm text-[var(--text-secondary)] truncate">{song.artist}</div>
                                    </div>
                                    <SongContextMenu
                                        song={song}
                                        onAddToPlaylist={() => setShowAddToPlaylist(song)}
                                        className="opacity-0 group-hover:opacity-100 transition"
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Playlists View */}
            {activeTab === 'playlists' && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {playlists.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-[var(--text-secondary)]">
                            <List size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No playlists yet.</p>
                            <button onClick={() => setShowCreatePlaylist(true)} className="mt-4 text-[var(--accent)] underline">Create one</button>
                        </div>
                    ) : (
                        playlists.map(playlist => (
                            <div key={playlist.id} className="p-4 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition cursor-pointer">
                                <div className="aspect-square rounded-lg bg-[var(--bg-primary)] mb-4 flex items-center justify-center text-[var(--text-tertiary)] shadow-md">
                                    <List size={40} />
                                </div>
                                <div className="font-semibold truncate text-[var(--text-primary)]">{playlist.name}</div>
                                <div className="text-sm text-[var(--text-secondary)] truncate">Playlist</div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Create Playlist Modal */}
            {showCreatePlaylist && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl w-full max-w-md shadow-2xl border border-[var(--border-color)]">
                        <h2 className="text-xl font-bold mb-4">New Playlist</h2>
                        <input
                            type="text"
                            autoFocus
                            placeholder="My Awesome Playlist"
                            value={newPlaylistName}
                            onChange={(e) => setNewPlaylistName(e.target.value)}
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-2 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowCreatePlaylist(false)} className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                            <button onClick={createPlaylist} className="bg-[var(--accent)] text-black px-4 py-2 rounded-xl font-semibold">Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add to Playlist Modal */}
            {showAddToPlaylist && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl w-full max-w-md shadow-2xl border border-[var(--border-color)]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Add to Playlist</h2>
                            <button onClick={() => setShowAddToPlaylist(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">Adding: <span className="text-[var(--text-primary)] font-medium">{showAddToPlaylist.title}</span></p>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {playlists.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() => addToPlaylist(pl.id)}
                                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-[var(--bg-hover)] transition flex items-center gap-3"
                                >
                                    <div className="w-8 h-8 rounded bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-tertiary)]">
                                        <List size={16} />
                                    </div>
                                    <span className="font-medium text-[var(--text-primary)]">{pl.name}</span>
                                </button>
                            ))}
                            {playlists.length === 0 && <p className="text-center text-[var(--text-secondary)] py-4">No playlists found. Create one first!</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
