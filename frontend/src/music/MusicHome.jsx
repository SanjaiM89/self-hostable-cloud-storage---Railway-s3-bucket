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
        <div className="p-8 space-y-8 animate-fade-in text-white">
            {/* Hero Section: Liked Songs */}
            <div
                className="relative h-64 rounded-3xl overflow-hidden cursor-pointer group"
                onClick={() => navigate('/music/library')}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-pink-600 z-0 group-hover:scale-105 transition-transform duration-500"></div>
                <div className="absolute inset-0 bg-black/10 z-10"></div>
                <div className="relative z-20 p-8 h-full flex flex-col justify-center">
                    <h2 className="text-4xl font-bold mb-2 text-white">Your Liked Songs</h2>
                    <p className="text-white/80 font-medium mb-6">{likedSongsCount} songs • 12 hr 30 min</p>
                    <div className="flex gap-4">
                        <button className="bg-white text-black px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-gray-100 transition shadow-lg">
                            <Play size={20} fill="currentColor" /> Play
                        </button>
                    </div>
                </div>
                <div className="absolute right-10 bottom-0 opacity-20 transform translate-y-10 group-hover:translate-y-4 transition duration-500">
                    <Heart size={200} fill="currentColor" />
                </div>
            </div>

            {/* Most Played (Horizontal) */}
            <div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="text-xl font-bold">Most Played</h3>
                    <button className="text-xs text-gray-400 hover:text-white transition">View All</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {recentSongs.length === 0 ? <p className="text-gray-500">No songs yet.</p> : recentSongs.map(song => (
                        <div
                            key={song.id}
                            className="min-w-[160px] p-3 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer group"
                            onClick={() => playSong(song)}
                        >
                            <div className="aspect-square rounded-lg bg-gray-800 mb-3 relative overflow-hidden">
                                {song.cover_art ? (
                                    <img src={song.cover_art} alt={song.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600"><Music size={32} /></div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                    <Play size={32} fill="white" className="text-white" />
                                </div>
                            </div>
                            <h4 className="font-semibold truncate text-sm">{song.title}</h4>
                            <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Hot Songs (Horizontal / Grid) */}
            <div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="text-xl font-bold">Hot Songs</h3>
                    <button className="text-xs text-gray-400 hover:text-white transition">View All</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {hotSongs.length === 0 ? <p className="text-gray-500">No hot songs yet.</p> : hotSongs.map((song, i) => (
                        <div
                            key={song.id}
                            className="min-w-[200px] flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-white/5 to-transparent hover:bg-white/10 transition cursor-pointer group"
                            onClick={() => playSong(song)}
                        >
                            <div className="w-16 h-16 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden relative">
                                {song.cover_art ? (
                                    <img src={song.cover_art} alt={song.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600 font-bold text-xl">{i + 1}</div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-semibold truncate text-sm">{song.title}</h4>
                                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
