import { useState, useRef, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { filesAPI } from '../utils/api';
import Loader from '../components/Loader';
import VideoPlayer from '../components/VideoPlayer';

export default function MobileMediaViewer({ file, onClose }) {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Swipe to close
    const startYRef = useRef(0);
    const [dragY, setDragY] = useState(0);
    const draggingRef = useRef(false);

    useEffect(() => {
        if (!file) return;
        const fetchUrl = async () => {
            try {
                setLoading(true);
                const res = await filesAPI.download(file.id);
                setUrl(res.data.url);
            } catch (err) {
                setError('Failed to load media.');
            } finally {
                setLoading(false);
            }
        };
        fetchUrl();
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [file]);

    if (!file) return null;

    const isVideo = file.mime_type?.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(file.name);
    const isAudio = file.mime_type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(file.name);
    const isImage = file.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);

    const handleDownload = () => {
        if (url) window.open(url, '_blank');
    };

    const handleTouchStart = (e) => {
        startYRef.current = e.touches[0].clientY;
        draggingRef.current = true;
    };
    const handleTouchMove = (e) => {
        if (!draggingRef.current) return;
        const dy = e.touches[0].clientY - startYRef.current;
        if (dy > 0) setDragY(dy);
    };
    const handleTouchEnd = () => {
        draggingRef.current = false;
        if (dragY > 120) {
            onClose();
        } else {
            setDragY(0);
        }
    };

    const opacity = Math.max(0.3, 1 - dragY / 300);

    return (
        <div
            className="fixed inset-0 z-[70] bg-black flex flex-col"
            style={{ opacity, transition: draggingRef.current ? 'none' : 'opacity 0.2s' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm z-10">
                <button onClick={onClose} className="p-2 rounded-lg text-white/80 active:text-white">
                    <X className="w-6 h-6" />
                </button>
                <p className="text-[14px] text-white/80 truncate flex-1 text-center px-4">{file.name}</p>
                <button onClick={handleDownload} className="p-2 rounded-lg text-white/80 active:text-white">
                    <Download className="w-6 h-6" />
                </button>
            </div>

            {/* Content */}
            <div
                className="flex-1 flex items-center justify-center overflow-hidden"
                style={{ transform: `translateY(${dragY}px)`, transition: draggingRef.current ? 'none' : 'transform 0.2s ease-out' }}
            >
                {loading ? (
                    <div className="flex flex-col items-center text-white">
                        <Loader className="mb-4" />
                        <p>Loading media...</p>
                    </div>
                ) : error ? (
                    <div className="text-center text-red-400 px-4">
                        <p className="mb-4">{error}</p>
                        <button onClick={handleDownload} className="px-4 py-2 bg-white/10 rounded-lg text-white">Try Download</button>
                    </div>
                ) : isImage ? (
                    <img
                        src={url}
                        alt={file.name}
                        className="max-w-full max-h-full object-contain"
                        style={{ touchAction: 'pinch-zoom' }}
                    />
                ) : isVideo ? (
                    <VideoPlayer
                        src={url}
                        fileName={file.name}
                    />
                ) : isAudio ? (
                    <div className="w-full px-8">
                        <div className="bg-white/10 rounded-2xl p-6 flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                                <span className="text-3xl">🎵</span>
                            </div>
                            <p className="text-white text-center truncate w-full">{file.name}</p>
                            <audio src={url} controls className="w-full" />
                        </div>
                    </div>
                ) : (
                    <p className="text-white/60">Preview not available</p>
                )}
            </div>
        </div>
    );
}
