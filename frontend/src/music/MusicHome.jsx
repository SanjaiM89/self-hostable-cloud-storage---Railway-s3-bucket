import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Play, Heart, Clock, Music } from 'lucide-react';

export default function MusicHome() {
    const { playSong, addToQueue } = useOutletContext();
    const navigate = useNavigate();
    const [recentSongs, setRecentSongs] = useState([]);
    const [hotSongs, setHotSongs] = useState([]);
    const [likedSongsCount, setLikedSongsCount] = useState(0);

    useEffect(() => {
        // Fetch data
        const loadData = async () => {
            try {
                // Mocking "Most Played" and "Hot" with random slices of all songs for now
                const res = await api.get('/music/songs');
                const allSongs = res.data;

                // Shuffle for "Hot"
                const shuffled = [...allSongs].sort(() => 0.5 - Math.random());
                setHotSongs(shuffled.slice(0, 5));

                // Take first few for "Recent" (effectively "Most Played" mock)
                setRecentSongs(allSongs.slice(0, 6));

                setLikedSongsCount(allSongs.length); // Assuming all in library are "Liked" for now
            } catch (e) {
                console.error("Failed to load music home data", e);
            }
        };
        loadData();
    }, []);

    return (
        <div className="p-8 space-y-8 animate-fade-in text-white pb-32">

            {/* Greeting / Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Home</h1>
                    <p className="text-[var(--text-secondary)]">Welcome back to your library.</p>
                </div>
            </div>

            {/* Most Played */}
            <section>
                <div className="flex justify-between items-end mb-4">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Most Played</h2>
                    <button className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">View All</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                    {recentSongs.length === 0 ? (
                        <div className="text-[var(--text-secondary)] text-sm italic">Start listening to see your most played tracks.</div>
                    ) : (
                        recentSongs.map(song => (
                            <div
                                key={song.id}
                                className="min-w-[160px] max-w-[160px] p-3 rounded-2xl hover:bg-[var(--card-bg-hover)] transition-all duration-300 cursor-pointer group"
                                onClick={() => playSong(song)}
                            >
                                <div className="aspect-square rounded-xl bg-[var(--bg-tertiary)] mb-3 relative overflow-hidden shadow-lg group-hover:shadow-xl transition-all">
                                    {song.cover_art ? (
                                        <img src={song.cover_art} alt={song.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]"><Music size={32} /></div>
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <button className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center transform scale-0 group-hover:scale-100 transition-transform duration-300 delay-75 shadow-lg">
                                            <Play size={20} fill="currentColor" className="ml-0.5" />
                                        </button>
                                    </div>
                                </div>
                                <h4 className="font-bold truncate text-[var(--text-primary)] mb-1" title={song.title}>{song.title}</h4>
                                <p className="text-xs text-[var(--text-secondary)] truncate" title={song.artist}>{song.artist}</p>
                            </div>
                        ))
                    )}
                </div>
            </section>

            {/* Hot Songs */}
            <section>
                <div className="flex justify-between items-end mb-4">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">Hot This Week</h2>
                    <button className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">View All</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {hotSongs.map((song, i) => (
                        <div
                            key={song.id}
                            className="flex items-center gap-4 p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--card-bg-hover)] transition-colors cursor-pointer group border border-transparent hover:border-[var(--border-color)]"
                            onClick={() => playSong(song)}
                        >
                            <span className="text-lg font-bold text-[var(--text-tertiary)] w-6 text-center">{i + 1}</span>
                            <div className="w-14 h-14 rounded-lg bg-[var(--bg-tertiary)] flex-shrink-0 overflow-hidden relative">
                                {song.cover_art ? (
                                    <img src={song.cover_art} alt={song.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]"><Music size={16} /></div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                    <Play size={16} fill="white" className="text-white" />
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="font-medium truncate text-[var(--text-primary)]">{song.title}</h4>
                                <p className="text-xs text-[var(--text-secondary)] truncate">{song.artist}</p>
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">
                                {Math.floor(Math.random() * 5) + 2}:{Math.floor(Math.random() * 60).toString().padStart(2, '0')}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
