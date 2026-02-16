import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { filesAPI } from '../utils/api';
import Loader from './Loader';

export default function MediaViewerModal({ file, onClose }) {
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const videoRef = useRef(null);

    useEffect(() => {
        if (!file) return;

        // Fetch presigned URL
        const fetchUrl = async () => {
            try {
                setLoading(true);
                const res = await filesAPI.download(file.id);
                setUrl(res.data.url);
            } catch (err) {
                console.error("Error fetching media URL:", err);
                setError("Failed to load media.");
            } finally {
                setLoading(false);
            }
        };

        fetchUrl();
    }, [file]);

    if (!file) return null;

    const isVideo = file.mime_type?.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(file.name);
    const isAudio = file.mime_type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(file.name);
    const isImage = file.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);

    const handleDownload = () => {
        if (url) {
            window.open(url, '_blank');
        }
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center text-white">
                    <Loader className="mb-4" />
                    <p>Loading media...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="text-center text-red-400">
                    <p className="mb-4">{error}</p>
                    <button
                        onClick={handleDownload}
                        className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white"
                    >
                        Try Download Instead
                    </button>
                </div>
            );
        }

        if (isVideo) {
            return (
                <video
                    ref={videoRef}
                    src={url}
                    controls
                    autoPlay
                    className="max-h-[80vh] max-w-full rounded-lg shadow-2xl bg-black"
                >
                    Your browser does not support the video tag.
                </video>
            );
        }

        if (isAudio) {
            return (
                <div className="bg-[#1e1e2e] p-8 rounded-xl shadow-2xl flex flex-col items-center min-w-[300px]">
                    <div className="w-16 h-16 bg-[var(--accent)]/20 rounded-full flex items-center justify-center mb-6 text-[var(--accent)]">
                        <Volume2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-white font-medium mb-6 text-center max-w-md truncate">{file.name}</h3>
                    <audio src={url} controls className="w-full" autoPlay />
                </div>
            );
        }

        if (isImage) {
            return (
                <img
                    src={url}
                    alt={file.name}
                    className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
            );
        }

        return (
            <div className="text-center text-white">
                <p className="mb-4">Preview not available for this file type.</p>
                <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-[var(--accent)] text-[#1e1e2e] font-medium rounded-lg hover:brightness-110 transition-all flex items-center gap-2 mx-auto"
                >
                    <Download className="w-4 h-4" /> Download File
                </button>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 rounded-full transition-all"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Header Info */}
            <div className="absolute top-4 left-4 flex items-center gap-3 text-white/90 bg-black/50 px-4 py-2 rounded-full">
                <span className="font-medium truncate max-w-[300px]">{file.name}</span>
                <button
                    onClick={handleDownload}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                    title="Download"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>

            {renderContent()}
        </div>
    );
}
