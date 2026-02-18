import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Player from './Player';
import SmartSearch from './SmartSearch';
import { Youtube, Music, Sparkles, Settings as SettingsIcon, Disc } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function MusicLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    // Music State
    const [currentSong, setCurrentSong] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [queue, setQueue] = useState([]);
    const audioRef = useRef(new Audio());
    const wsRef = useRef(null);

    // WebSocket Logic
    useEffect(() => {
        if (!user) return;

        // Connect to WS
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        // Extract host from API URL
        const apiHost = apiUrl.replace(/^https?:\/\//, '');
        const protocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';

        // Ensure user.id exists
        if (!user?.id) return;

        const wsUrl = `${protocol}//${apiHost}/api/music/ws/${user.id}`;

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log("Music WS Connected");
        };

        wsRef.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        };

        wsRef.current.onclose = () => {
            console.log("Music WS Disconnected");
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [user]);

    const handleWsMessage = (data) => {
        if (data.type === 'PLAYER_STATE') {
            // Optional: prevent loop if this device sent it
            // Simple sync:
            if (data.song?.id !== currentSong?.id) {
                // setCurrentSong(data.song); // Auto-play on sync?
            }
            if (data.isPlaying !== isPlaying) {
                // setIsPlaying(data.isPlaying);
            }
        }
    };

    // Broadcast State
    const broadcastState = (type, payload) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type, ...payload }));
        }
    };

    // Playback Logic
    useEffect(() => {
        if (currentSong) {
            // Ensure we use the full URL for audio
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            let fullUrl = currentSong.url.startsWith('http') ? currentSong.url : `${apiUrl}${currentSong.url}`;

            // Append token for authentication
            const token = localStorage.getItem('token');
            if (token && !fullUrl.includes('token=')) {
                fullUrl += fullUrl.includes('?') ? `&token=${token}` : `?token=${token}`;
            }

            audioRef.current.src = fullUrl;
            audioRef.current.play()
                .then(() => {
                    setIsPlaying(true);
                    broadcastState('PLAYER_STATE', { isPlaying: true, song: currentSong });
                })
                .catch(e => console.error("Playback failed", e));
        }
    }, [currentSong]);

    useEffect(() => {
        const audio = audioRef.current;
        const handleEnded = () => {
            playNext();
        };
        audio.addEventListener('ended', handleEnded);
        return () => audio.removeEventListener('ended', handleEnded);
    }, [currentSong, queue]);

    const togglePlay = () => {
        if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
            broadcastState('PLAYER_STATE', { isPlaying: true });
        } else {
            audioRef.current.pause();
            setIsPlaying(false);
            broadcastState('PLAYER_STATE', { isPlaying: false });
        }
    };

    const playSong = (song) => {
        // If song is not in queue, add it to the front or replace? 
        // Standard behavior: Play immediately.
        // If we want to maintain the current queue context, we might want to insert it after current?
        if (!queue.find(s => s.id === song.id)) {
            setQueue(prev => [...prev, song]);
        }
        setCurrentSong(song);
        setIsPlaying(true);
    };

    const addToQueue = (song) => {
        if (!queue.find(s => s.id === song.id)) {
            setQueue(prev => [...prev, song]);
        }
    };

    const playNextInQueue = (song) => {
        // Insert after current song
        if (!currentSong) {
            playSong(song);
            return;
        }
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const newQueue = [...queue];
        if (currentIndex !== -1) {
            newQueue.splice(currentIndex + 1, 0, song);
        } else {
            newQueue.push(song);
        }
        setQueue(newQueue);
    };

    const playNext = () => {
        if (!currentSong || queue.length === 0) return;
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const nextSong = queue[currentIndex + 1];
        if (nextSong) {
            setCurrentSong(nextSong);
        } else {
            setIsPlaying(false);
        }
    };

    const playPrev = () => {
        if (!currentSong || queue.length === 0) return;
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const prevSong = queue[currentIndex - 1];
        if (prevSong) {
            setCurrentSong(prevSong);
        } else {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
        }
    };

    const NavButton = ({ to, icon: Icon, label, colorClass = "bg-[var(--accent)]" }) => (
        <button
            onClick={() => navigate(to)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${location.pathname === to ? `${colorClass} text-black font-medium` : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
            <Icon size={18} /> {label}
        </button>
    );

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] transition-colors duration-200 main-content-area">
            <div className="desktop-sidebar">
                <Sidebar
                    currentFolder={null}
                    onNavigate={(id) => { window.location.href = id ? `/?folder=${id}` : '/' }}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(p => !p)}
                />
            </div>

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Music Header */}
                <div className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between px-6 z-40">
                    <div className="flex items-center gap-4">
                        <NavButton to="/music/discovery" icon={Sparkles} label="For You" colorClass="bg-gradient-to-r from-pink-500 to-purple-500 text-white" />
                        <NavButton to="/music" icon={Music} label="Library" />
                        <NavButton to="/music/playlists" icon={Disc} label="Playlists" />
                        <NavButton to="/music/youtube" icon={Youtube} label="YouTube" colorClass="bg-red-500 text-white" />
                        <NavButton to="/music/settings" icon={SettingsIcon} label="Settings" colorClass="bg-gray-500 text-white" />
                    </div>

                    <SmartSearch onPlay={playSong} />
                </div>

                <div className="flex-1 overflow-y-auto pb-24">
                    <Outlet context={{ playSong, addToQueue, playNextInQueue, currentSong, isPlaying, queue, setQueue }} />
                </div>

                {/* Persistent Player Footer */}
                <div className="absolute bottom-0 left-0 right-0 z-50">
                    <Player
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        onTogglePlay={togglePlay}
                        onNext={playNext}
                        onPrev={playPrev}
                        audioRef={audioRef}
                    />
                </div>
            </main>
        </div>
    );
}
