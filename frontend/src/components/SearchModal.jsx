import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Folder, FileText, Plus, Hash, Tag, X } from 'lucide-react';
import { filesAPI } from '../utils/api';
import Loader from './Loader';

const RECENTS_KEY = 'search_recents_v1';

export default function SearchModal({ open, onClose, currentFolder, includeTrashed = false, onOpenResult }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
  });
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await filesAPI.search(query, { parentId: currentFolder, includeTrashed, limit: 30, offset: 0 });
        const searchPayload = res.data;
        const parsed = Array.isArray(searchPayload) ? searchPayload : (searchPayload?.items || []);
        setResults(parsed);
      } catch (e) {
        console.error('Search failed', e);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open, currentFolder, includeTrashed]);

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  const pickResult = (item) => {
    if (!item) return;
    const next = [item.name, ...recents.filter((r) => r !== item.name)].slice(0, 6);
    setRecents(next);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    onOpenResult?.(item);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="pointer-events-auto w-[25.625rem] max-w-full rounded-lg bg-[var(--card-bg)] text-[0.8125rem]/5 text-[var(--text-primary)] ring-1 shadow-xl shadow-black/20 ring-[var(--border-color)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3.5 py-2.5 text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
          <Search className="mr-2 size-5" />
          <input
            ref={inputRef}
            type="text"
            className="bg-transparent flex-1 text-[var(--text-primary)] outline-none"
            placeholder="Search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-secondary)]"><X className="w-4 h-4" /></button>
        </div>

        {loading && (
          <div className="px-3.5 py-4 flex justify-center"><Loader className="scale-75" /></div>
        )}

        {!loading && !query.trim() && (
          <div className="border-t border-[var(--border-color)] px-3.5 py-3">
            <div className="mb-1.5 text-[0.6875rem] font-semibold text-[var(--text-tertiary)]">Recent searches</div>
            {(recents.length ? recents : ['Cloud Fat 1', 'Compiler Design']).map((label, i) => (
              <button key={`${label}-${i}`} className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black">
                <Folder className="mr-2.5 size-5 flex-none" />
                {label}
              </button>
            ))}
          </div>
        )}

        {!loading && query.trim() && (
          <div className="max-h-[340px] overflow-y-auto px-3.5 py-3 space-y-1 border-t border-[var(--border-color)]">
            {results.length === 0 ? (
              <div className="text-[var(--text-tertiary)] py-2">No matching files.</div>
            ) : (
              results.map((item) => (
                <button key={item.id} onClick={() => pickResult(item)} className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black">
                  {item.is_folder ? <Folder className="mr-2.5 size-5 flex-none" /> : <FileText className="mr-2.5 size-5 flex-none" />}
                  <span className="truncate">{item.name}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="border-t border-[var(--border-color)] px-3.5 py-3">
          <button className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black"><FileText className="mr-2.5 size-5" />Add new file...</button>
          <button className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black"><Plus className="mr-2.5 size-5" />Add new folder...</button>
          <button className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black"><Hash className="mr-2.5 size-5" />Add hashtag...</button>
          <button className="w-full text-left flex items-center rounded-md p-1.5 hover:bg-[var(--accent)] hover:text-black"><Tag className="mr-2.5 size-5" />Add label...</button>
        </div>
      </div>
    </div>
  );
}
