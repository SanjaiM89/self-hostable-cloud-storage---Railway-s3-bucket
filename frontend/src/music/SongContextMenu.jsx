import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MoreVertical, Plus, Trash2, List } from 'lucide-react';
import api from '../utils/api';

const SongContextMenu = ({ song, onAddToPlaylist, onDelete, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const { addToQueue, playNextInQueue } = useOutletContext() || {}; // Safe destructure if used outside context (rare)

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const toggleMenu = (e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleAction = (e, action) => {
        e.stopPropagation();
        setIsOpen(false);
        if (action === 'add') {
            onAddToPlaylist && onAddToPlaylist(song);
        } else if (action === 'delete') {
            if (window.confirm(`Are you sure you want to delete "${song.title}"?`)) {
                onDelete && onDelete(song);
            }
        } else if (action === 'queue') {
            addToQueue && addToQueue(song);
        } else if (action === 'playNext') {
            playNextInQueue && playNextInQueue(song);
        }
    };

    return (
        <div className={`relative ${className}`} ref={menuRef}>
            <button
                onClick={toggleMenu}
                className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition"
            >
                <MoreVertical size={20} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in backdrop-blur-md">
                    <div className="py-1">
                        <button
                            onClick={(e) => handleAction(e, 'playNext')}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-3 transition"
                        >
                            <List size={16} className="text-white/50" />
                            Play Next
                        </button>
                        <button
                            onClick={(e) => handleAction(e, 'queue')}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-3 transition"
                        >
                            <List size={16} className="text-white/50" />
                            Add to Queue
                        </button>
                        <button
                            onClick={(e) => handleAction(e, 'add')}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-3 transition"
                        >
                            <Plus size={16} className="text-white/50" />
                            Add to Playlist
                        </button>
                        {onDelete && (
                            <button
                                onClick={(e) => handleAction(e, 'delete')}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-white/10 flex items-center gap-3 transition"
                            >
                                <Trash2 size={16} className="text-red-400/50" />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SongContextMenu;
