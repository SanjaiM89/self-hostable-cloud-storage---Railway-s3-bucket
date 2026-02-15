import { useState, useEffect, useRef } from 'react';
import { FiLink, FiCopy, FiCheck, FiTrash2, FiUserPlus, FiGlobe, FiX } from 'react-icons/fi';
import { sharesAPI } from '../utils/api';

export default function ShareModal({ file, onClose }) {
    const [shares, setShares] = useState([]);
    const [publicShare, setPublicShare] = useState(null);
    const [publicPermission, setPublicPermission] = useState('view');
    const [username, setUsername] = useState('');
    const [userPermission, setUserPermission] = useState('view');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const inputRef = useRef(null);

    useEffect(() => {
        loadShares();
    }, []);

    const loadShares = async () => {
        try {
            const res = await sharesAPI.list(file.id);
            const all = res.data || [];
            setShares(all.filter(s => s.share_type === 'user'));
            const pub = all.find(s => s.share_type === 'public');
            if (pub) {
                setPublicShare(pub);
                setPublicPermission(pub.permission);
            }
        } catch (e) {
            console.error('Failed to load shares:', e);
        } finally {
            setLoading(false);
        }
    };

    const togglePublicLink = async () => {
        setError('');
        if (publicShare) {
            // Revoke
            try {
                await sharesAPI.revoke(publicShare.id);
                setPublicShare(null);
            } catch (e) {
                setError('Failed to revoke public link');
            }
        } else {
            // Create
            try {
                const res = await sharesAPI.create(file.id, {
                    share_type: 'public',
                    permission: publicPermission,
                });
                setPublicShare(res.data);
            } catch (e) {
                setError('Failed to create public link');
            }
        }
    };

    const updatePublicPermission = async (perm) => {
        setPublicPermission(perm);
        if (publicShare) {
            try {
                const res = await sharesAPI.create(file.id, {
                    share_type: 'public',
                    permission: perm,
                });
                setPublicShare(res.data);
            } catch (e) {
                setError('Failed to update permission');
            }
        }
    };

    const copyLink = () => {
        if (!publicShare) return;
        const url = `${window.location.origin}/share/${publicShare.share_token}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const addUser = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;
        setError('');
        try {
            const res = await sharesAPI.create(file.id, {
                share_type: 'user',
                permission: userPermission,
                username: username.trim(),
            });
            setShares(prev => [...prev.filter(s => s.shared_with !== username.trim()), res.data]);
            setUsername('');
        } catch (e) {
            setError(e.response?.data?.detail || 'Failed to share with user');
        }
    };

    const removeUser = async (shareId) => {
        try {
            await sharesAPI.revoke(shareId);
            setShares(prev => prev.filter(s => s.id !== shareId));
        } catch (e) {
            setError('Failed to remove user');
        }
    };

    const shareLink = publicShare ? `${window.location.origin}/share/${publicShare.share_token}` : '';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative z-10 w-[480px] max-h-[80vh] rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                        Share "{file.name}"
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--card-hover)] transition-colors"
                    >
                        <FiX className="w-4 h-4" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="w-5 h-5 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto px-5 pb-2">
                        {/* ── Public Link Section ── */}
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <FiGlobe className="w-4 h-4 text-[var(--text-tertiary)]" />
                                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Public Link</span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                <button
                                    onClick={togglePublicLink}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${publicShare ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'}`}
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${publicShare ? 'translate-x-5' : 'translate-x-0'}`}
                                    />
                                </button>
                                <span className="text-[12px] text-[var(--text-tertiary)]">
                                    {publicShare ? 'Anyone with the link' : 'Disabled'}
                                </span>
                            </div>

                            {publicShare && (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <select
                                            value={publicPermission}
                                            onChange={(e) => updatePublicPermission(e.target.value)}
                                            className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                        >
                                            <option value="view">View only</option>
                                            <option value="download">Can download</option>
                                            <option value="edit">Can edit</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            readOnly
                                            value={shareLink}
                                            className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[11px] text-[var(--text-tertiary)] truncate focus:outline-none"
                                        />
                                        <button
                                            onClick={copyLink}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                                        >
                                            {copied ? <FiCheck className="w-3.5 h-3.5" /> : <FiCopy className="w-3.5 h-3.5" />}
                                            {copied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-[var(--border-color)] my-3" />

                        {/* ── Share with Users ── */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <FiUserPlus className="w-4 h-4 text-[var(--text-tertiary)]" />
                                <span className="text-[13px] font-medium text-[var(--text-secondary)]">Share with Users</span>
                            </div>

                            <form onSubmit={addUser} className="flex gap-2 mb-3">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter username..."
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                                />
                                <select
                                    value={userPermission}
                                    onChange={(e) => setUserPermission(e.target.value)}
                                    className="px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                >
                                    <option value="view">View</option>
                                    <option value="download">Download</option>
                                    <option value="edit">Edit</option>
                                </select>
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                                >
                                    Add
                                </button>
                            </form>

                            {/* Shared users list */}
                            {shares.length > 0 && (
                                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                                    {shares.map((s) => (
                                        <div
                                            key={s.id}
                                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                                                    {s.shared_with?.[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-[12px] text-[var(--text-primary)]">{s.shared_with}</span>
                                                <span className="text-[10px] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--card-hover)]">
                                                    {s.permission}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => removeUser(s.id)}
                                                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-red-500/10 transition-colors"
                                            >
                                                <FiTrash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="px-5 py-2 text-[12px] text-[var(--danger)] bg-red-500/10">
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
