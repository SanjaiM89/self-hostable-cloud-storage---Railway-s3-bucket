import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MusicSidebar from './MusicSidebar';
import IconRail from '../components/IconRail';
import RightPanel from './RightPanel';
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

                    // Record History
                    api.post('/music/history', {
                        file_id: currentSong.id,
                        duration: 0
                    }).catch(e => console.error("Failed to record history", e));
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

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans selection:bg-pink-500 selection:text-white transition-colors duration-200">

            {/* Left Rail (Icon Rail) */}
            <div className="h-full flex-shrink-0 z-30">
                <IconRail
                    onNavigate={(id) => { window.location.href = id ? `/?folder=${id}` : '/' }}
                    collapsed={false}
                    onToggleCollapse={() => setSidebarCollapsed(p => !p)}
                />
            </div>

            {/* Music Sidebar (Sub-navigation) */}
            <div className={`hidden md:block transition-all duration-300 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'} border-r border-[var(--sidebar-border)]`}>
                <MusicSidebar />
            </div>

            {/* Content Wrapper (Main + Right Panel + Player) */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">

                <div className="flex-1 flex overflow-hidden">
                    {/* Main Content Area */}
                    <main className="flex-1 flex flex-col min-w-0 relative">
                        {/* Search / Top Bar */}
                        <div className="h-20 flex items-center justify-between px-8 z-20">
                            <div className="flex-1 max-w-xl">
                                <SmartSearch onPlay={playSong} />
                            </div>
                            <div className="flex items-center gap-4 ml-4">
                                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border border-white/10">
                                    {/* User Avatar Placeholder */}
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500 text-white font-bold">
                                        {user?.username?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 pb-24 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                            <Outlet context={{ playSong, addToQueue, playNextInQueue, currentSong, isPlaying, queue, setQueue }} />
                        </div>
                    </main>

                    {/* Right Panel (Desktop Only) */}
                    <div className="hidden xl:block h-full border-l border-[var(--border-color)]">
                        <RightPanel
                            currentSong={currentSong}
                            isPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                            onNext={playNext}
                            onPrev={playPrev}
                        />
                    </div>
                </div>

                {/* Mobile/Tablet/Desktop Bottom Player (Always Visible) */}
                <div className="flex-shrink-0 z-50 w-full relative">
                    <Player
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        onTogglePlay={togglePlay}
                        onNext={playNext}
                        onPrev={playPrev}
                        audioRef={audioRef}
                    />
                </div>
            </div>
        </div>
    );
}
