import { useState, useEffect, useRef } from 'react';
import { Link, Copy, Check, Trash2, UserPlus, Globe, X } from 'lucide-react';
import { sharesAPI } from '../utils/api';
import Loader from '../components/Loader';

export default function MobileShareModal({ file, onClose }) {
    const [loading, setLoading] = useState(true);
    const [shares, setShares] = useState([]);
    const [publicShare, setPublicShare] = useState(null);
    const [publicPermission, setPublicPermission] = useState('view');
    const [username, setUsername] = useState('');
    const [userPermission, setUserPermission] = useState('view');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const loadShares = async () => {
        try {
            setLoading(true);
            const res = await sharesAPI.list(file.id);
            const all = res.data || [];
            setPublicShare(all.find((s) => s.is_public) || null);
            setPublicPermission(all.find((s) => s.is_public)?.permission || 'view');
            setShares(all.filter((s) => !s.is_public));
        } catch (e) {
            setError('Failed to load shares');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadShares();
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [file.id]);

    const togglePublicLink = async () => {
        try {
            if (publicShare) {
                await sharesAPI.delete(publicShare.id);
                setPublicShare(null);
            } else {
                const res = await sharesAPI.createPublic(file.id, publicPermission);
                setPublicShare(res.data);
            }
        } catch (e) {
            setError('Failed to toggle public link');
        }
    };

    const updatePublicPermission = async (perm) => {
        if (!publicShare) return;
        try {
            setPublicPermission(perm);
            await sharesAPI.updatePermission(publicShare.id, perm);
            await loadShares();
        } catch (e) {
            setError('Failed to update permission');
        }
    };

    const copyLink = () => {
        const link = `${window.location.origin}/share/${publicShare.share_token}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const addUser = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;
        try {
            setError('');
            await sharesAPI.createUser(file.id, username.trim(), userPermission);
            setUsername('');
            await loadShares();
        } catch (e) {
            setError(e.response?.data?.detail || 'Failed to share');
        }
    };

    const removeUser = async (shareId) => {
        try {
            await sharesAPI.delete(shareId);
            await loadShares();
        } catch (e) {
            setError('Failed to remove');
        }
    };

    const shareLink = publicShare ? `${window.location.origin}/share/${publicShare.share_token}` : '';

    return (
        <div className="fixed inset-0 z-[70]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                className="absolute bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-2xl border-t border-[var(--border-color)] shadow-2xl flex flex-col"
                style={{ maxHeight: '85vh', animation: 'slideUp 0.25s ease-out' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-3">
                    <h3 className="text-[16px] font-semibold text-[var(--text-primary)] truncate flex-1 mr-2">
                        Share "{file.name}"
                    </h3>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-[var(--text-tertiary)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader className="scale-50" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-5 pb-2">
                        {/* ── Public Link ── */}
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Globe className="w-5 h-5 text-[var(--text-tertiary)]" />
                                <span className="text-[14px] font-medium text-[var(--text-secondary)]">Public Link</span>
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                                <button
                                    onClick={togglePublicLink}
                                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${publicShare ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${publicShare ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-[13px] text-[var(--text-tertiary)]">
                                    {publicShare ? 'Anyone with the link' : 'Disabled'}
                                </span>
                            </div>

                            {publicShare && (
                                <div className="space-y-3">
                                    <select
                                        value={publicPermission}
                                        onChange={(e) => updatePublicPermission(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                    >
                                        <option value="view">View only</option>
                                        <option value="download">Can download</option>
                                        <option value="edit">Can edit</option>
                                    </select>
                                    <input
                                        readOnly
                                        value={shareLink}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[13px] text-[var(--text-tertiary)] truncate focus:outline-none"
                                    />
                                    <button
                                        onClick={copyLink}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-medium bg-[var(--accent)] text-[#1e1e2e] active:brightness-90 transition-all"
                                    >
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {copied ? 'Copied!' : 'Copy Link'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-[var(--border-color)] my-4" />

                        {/* ── Share with Users ── */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <UserPlus className="w-5 h-5 text-[var(--text-tertiary)]" />
                                <span className="text-[14px] font-medium text-[var(--text-secondary)]">Share with Users</span>
                            </div>

                            <form onSubmit={addUser} className="space-y-2 mb-4">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter username..."
                                    className="w-full px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                                />
                                <div className="flex gap-2">
                                    <select
                                        value={userPermission}
                                        onChange={(e) => setUserPermission(e.target.value)}
                                        className="flex-1 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                    >
                                        <option value="view">View</option>
                                        <option value="download">Download</option>
                                        <option value="edit">Edit</option>
                                    </select>
                                    <button
                                        type="submit"
                                        className="px-6 py-3 rounded-xl text-[14px] font-medium bg-[var(--accent)] text-[#1e1e2e] active:brightness-90 transition-all"
                                    >
                                        Add
                                    </button>
                                </div>
                            </form>

                            {shares.length > 0 && (
                                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                                    {shares.map((s) => (
                                        <div
                                            key={s.id}
                                            className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-[12px] font-bold text-[var(--accent)] flex-shrink-0">
                                                    {s.shared_with?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-[13px] text-[var(--text-primary)] block truncate">{s.shared_with}</span>
                                                    <span className="text-[11px] text-[var(--text-tertiary)]">{s.permission}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeUser(s.id)}
                                                className="p-2 rounded-lg text-[var(--text-tertiary)] active:text-red-400 active:bg-red-500/10 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="px-5 py-2 text-[13px] text-red-400 bg-red-500/10">
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="px-5 py-4 border-t border-[var(--border-color)]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-xl text-[15px] font-semibold bg-[var(--accent)] text-[#1e1e2e] active:brightness-90 transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
