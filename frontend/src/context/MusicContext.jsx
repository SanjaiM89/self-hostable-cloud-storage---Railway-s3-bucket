import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const MusicContext = createContext();

export function useMusic() {
    return useContext(MusicContext);
}

export function MusicProvider({ children }) {
    const [currentSong, setCurrentSong] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [queue, setQueue] = useState([]);
    const audioRef = useRef(new Audio());
    const wsRef = useRef(null);

    const { user } = useAuth();

    // We need user ID for WebSocket, so we might need to access AuthContext here
    // But AuthContext is usually wrapping App, so we can't use useAuth() if MusicProvider is outside.
    // If MusicProvider is inside AuthProvider, we are good.
    // Let's assume MusicProvider is inside AuthProvider in App.jsx.

    // However, to keep it clean and avoid circular dependency issues if not careful, 
    // we will pass user/userId as a prop or handle connection inside a useEffect that depends on an external user check if needed.
    // Ideally, we move the WS logic here. But we need the user object.
    // Let's defer WS connection logic to a component or hook that has access to Auth, 
    // OR we can assume AuthProvider is a parent.
    // Since App.jsx has AuthProvider -> Routes, we can put MusicProvider inside AuthProvider.

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
                // setCurrentSong(data.song); // Auto-play on sync? - Commented out to avoid auto-play on load if unnecessary
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

    const playSong = useCallback((song) => {
        if (!queue.find(s => s.id === song.id)) {
            setQueue(prev => [...prev, song]);
        }
        setCurrentSong(song);
        setIsPlaying(true);
        broadcastState('PLAYER_STATE', { isPlaying: true, song: song });
    }, [queue]);

    const addToQueue = useCallback((song) => {
        if (!queue.find(s => s.id === song.id)) {
            setQueue(prev => [...prev, song]);
        }
    }, [queue]);

    const playNextInQueue = useCallback((song) => {
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
    }, [currentSong, queue, playSong]);

    const playNext = useCallback(async () => {
        if (!currentSong || queue.length === 0) return;
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const nextSong = queue[currentIndex + 1];

        if (nextSong) {
            setCurrentSong(nextSong);
            broadcastState('PLAYER_STATE', { isPlaying: true, song: nextSong });
        } else {
            // End of queue - fetch recommendation
            console.log("End of queue, fetching recommendation...");
            try {
                // Use current song as seed
                // Backend expects 'current_song_id'
                console.log("Fetching recs via API...");
                const res = await api.get('/music/recommendations', { params: { current_song_id: currentSong.id, limit: 1 } });
                console.log("Rec API Response:", res.data);

                // Response format is { recommendations: [], ai_playlist_name: ... }
                const recommended = res.data.recommendations;

                if (recommended && recommended.length > 0) {
                    // Try to find a track that isn't the current one
                    const nextTrack = recommended.find(track => track.id !== currentSong.id);

                    if (nextTrack) {
                        console.log("Next recommended track found:", nextTrack.title, nextTrack.id);
                        setQueue(prev => {
                            console.log("Updating queue with new track");
                            return [...prev, nextTrack];
                        });
                        setCurrentSong(nextTrack);
                        broadcastState('PLAYER_STATE', { isPlaying: true, song: nextTrack });
                        return; // Successfully played recommended
                    } else {
                        console.log("Only duplicate recommendation found (IDs match).");
                    }
                } else {
                    console.log("No recommendations returned in array.");
                }
            } catch (err) {
                console.error("Failed to fetch recommendation:", err);
            }

            // If recommendation failed or returned nothing, stop.
            setIsPlaying(false);
            broadcastState('PLAYER_STATE', { isPlaying: false });
        }
    }, [currentSong, queue]);

    const playPrev = useCallback(() => {
        if (!currentSong || queue.length === 0) return;
        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        const prevSong = queue[currentIndex - 1];
        if (prevSong) {
            setCurrentSong(prevSong);
            broadcastState('PLAYER_STATE', { isPlaying: true, song: prevSong });
        } else {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
        }
    }, [currentSong, queue]);

    const togglePlay = useCallback(() => {
        if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
            broadcastState('PLAYER_STATE', { isPlaying: true });
        } else {
            audioRef.current.pause();
            setIsPlaying(false);
            broadcastState('PLAYER_STATE', { isPlaying: false });
        }
    }, []);

    // Playback Logic
    useEffect(() => {
        const playAudio = async () => {
            if (currentSong) {
                try {
                    // Fetch direct S3 URL logic (copied from MusicLayout)
                    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                    let streamEndpoint = currentSong.url;

                    if (!streamEndpoint.startsWith('http')) {
                        streamEndpoint = streamEndpoint;
                    }

                    let requestUrl = streamEndpoint;
                    if (requestUrl.startsWith('/api')) {
                        requestUrl = requestUrl.substring(4);
                    }

                    // Only fetch new URL if it's different or we are starting a new song
                    // Optimization: check if audioRef.src already matches what we want? 
                    // But directUrl changes potentially. 

                    const res = await api.get(requestUrl, { params: { redirect: false } });
                    const directUrl = res.data.url;

                    if (audioRef.current.src !== directUrl) {
                        audioRef.current.src = directUrl;
                        await audioRef.current.play();
                    } else {
                        // If same src, just ensure playing
                        if (audioRef.current.paused) await audioRef.current.play();
                    }

                    setIsPlaying(true);
                    broadcastState('PLAYER_STATE', { isPlaying: true, song: currentSong });

                    // Record History
                    api.post('/music/history', {
                        file_id: currentSong.id,
                        duration: 0
                    }).catch(e => console.error("Failed to record history", e));

                } catch (e) {
                    console.error("Playback failed", e);
                }
            }
        };

        playAudio();
    }, [currentSong]);

    useEffect(() => {
        const audio = audioRef.current;
        const handleEnded = () => {
            playNext();
        };
        const handlePause = () => setIsPlaying(false);
        const handlePlay = () => setIsPlaying(true);

        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('play', handlePlay);

        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('play', handlePlay);
        };
    }, [playNext]);

    const value = {
        currentSong,
        setCurrentSong,
        isPlaying,
        setIsPlaying,
        queue,
        setQueue,
        audioRef,
        wsRef,
        playSong,
        addToQueue,
        playNextInQueue,
        playNext,
        playPrev,
        togglePlay
    };

    return (
        <MusicContext.Provider value={value}>
            {children}
        </MusicContext.Provider>
    );
}
