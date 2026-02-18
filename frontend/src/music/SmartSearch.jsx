import { useState, useEffect, useRef } from 'react';
import { Search, Music } from 'lucide-react';
import api from '../utils/api';

export default function SmartSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Todo: Implement fuzzy search on backend or fetch all songs and filter client-side?
    // For now, let's assume we filter client-side if the list is small, or use backend search
    // Let's implement client-side filtering of the "all songs" list for responsiveness if list < 1000

    const [allSongs, setAllSongs] = useState([]);

    useEffect(() => {
        // Determine if we should fetch all songs once or search on type
        api.get('/music/songs').then(res => setAllSongs(res.data)).catch(() => { });
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const lowerQ = query.toLowerCase();
        const filtered = allSongs.filter(song =>
            song.title.toLowerCase().includes(lowerQ) ||
            song.artist.toLowerCase().includes(lowerQ) ||
            song.album?.toLowerCase().includes(lowerQ)
        ).slice(0, 10);

        setResults(filtered);
    }, [query, allSongs]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative z-50">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus-within:ring-2 focus-within:ring-[var(--accent)] transition-all ${isOpen ? 'w-64' : 'w-48'}`}>
                <Search size={16} className="text-[var(--text-secondary)]" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search music..."
                    className="bg-transparent border-none focus:outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] w-full"
                />
            </div>

            {isOpen && query && (
                <div className="absolute top-full mt-2 w-80 right-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden">
                    {results.length > 0 ? (
                        <div className="py-2">
                            {results.map(song => (
                                <div
                                    key={song.id}
                                    className="px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer flex items-center gap-3 transition"
                                    onClick={() => {
                                        // Todo: Play song
                                        // window.playSong(song);
                                        setIsOpen(false);
                                    }}
                                >
                                    <div className="w-8 h-8 rounded bg-[var(--bg-primary)] flex items-center justify-center overflow-hidden">
                                        {song.cover_art ? <img src={song.cover_art} alt="" className="w-full h-full object-cover" /> : <Music size={14} className="text-[var(--text-secondary)]" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{song.title}</div>
                                        <div className="text-xs text-[var(--text-secondary)] truncate">{song.artist}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-sm text-[var(--text-secondary)]">No results found</div>
                    )}
                </div>
            )}
        </div>
    );
}
