import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, SkipForward, X, Maximize2, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMusic } from '../context/MusicContext';

export default function MiniPlayer() {
    const { currentSong, isPlaying, togglePlay, playNext } = useMusic();
    const navigate = useNavigate();
    const constraintsRef = useRef(null);

    if (!currentSong) return null;

    return (
        <>
            {/* Constraint area for dragging - typically the whole screen */}
            <motion.div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[100]" />

            <motion.div
                drag
                dragConstraints={constraintsRef}
                dragElastic={0.1}
                dragMomentum={false}
                initial={{ x: 20, y: -20 }} // Start near bottom-left (relative to bottom-left positioning if we used that, but simplified to fixed)
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 9999
                }}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md w-72 flex items-center pr-2 cursor-move"
            >
                {/* Art */}
                <div className="w-16 h-16 bg-gray-800 flex-shrink-0 relative group">
                    {currentSong.cover_art ? (
                        <img src={currentSong.cover_art} alt="" className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            <Music size={20} />
                        </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate('/music'); }}
                            className="text-white hover:scale-110 transition"
                        >
                            <Maximize2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Info */}
                <div className="ml-3 flex-1 min-w-0 flex flex-col justify-center h-16 pointer-events-none">
                    <div className="text-sm font-semibold truncate text-[var(--text-primary)]">{currentSong.title}</div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">{currentSong.artist || 'Unknown Artist'}</div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 pl-2" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                        onClick={togglePlay}
                        className="w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center hover:scale-105 transition hover:bg-[var(--accent)] hover:text-white"
                    >
                        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button
                        onClick={playNext}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                    >
                        <SkipForward size={18} fill="currentColor" />
                    </button>
                    {/* 
                    <button 
                        onClick={() => {}} // Close functionality? Usually just stops music? Or hides player?
                        // If we stop music, we clear currentSong.
                        className="text-[var(--text-secondary)] hover:text-red-400 p-1 ml-1"
                    >
                         <X size={16} />
                    </button>
                    */}
                </div>
            </motion.div>
        </>
    );
}
