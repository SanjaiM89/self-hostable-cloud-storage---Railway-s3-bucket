import { useEffect, useMemo, useRef, useState } from 'react';
import { Home, Trash2, Settings, Plus, Search, HardDrive, Clock3, Boxes, Sparkles, Shield, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { filesAPI } from '../utils/api';
import { Tree } from './ui/file-tree';

export default function Sidebar({ currentFolder, onNavigate, onCreateFolder, collapsed, onToggleCollapse, onOpenTrash, onOpenSearch }) {
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [storage, setStorage] = useState({ used: 0, total: 2 * 1024 * 1024 * 1024 });
    const [folderTree, setFolderTree] = useState([]);
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const user = useMemo(() => JSON.parse(localStorage.getItem('user') || 'null'), []);

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const fetchTree = async () => {
        try {
            const [treeRes, storageRes] = await Promise.all([filesAPI.tree(), filesAPI.storage()]);
            setFolderTree((treeRes.data || []).map((f) => convertFolderToTreeNode(f)));
            setStorage(storageRes.data);
        } catch (e) {
            console.error('Failed to load sidebar data:', e);
        }
    };

    useEffect(() => { fetchTree(); }, [currentFolder]);
    useEffect(() => { if (showNewFolder && inputRef.current) inputRef.current.focus(); }, [showNewFolder]);

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        onCreateFolder(newFolderName.trim());
        setNewFolderName('');
        setShowNewFolder(false);
        setTimeout(fetchTree, 300);
    };

    if (collapsed) {
        return (
            <aside className="w-[56px] h-screen flex flex-col items-center bg-[var(--sidebar-icon-rail)] border-r border-[var(--sidebar-border)] py-3 gap-2 flex-shrink-0">
                <button onClick={onToggleCollapse} className="icon-rail-btn" title="Expand sidebar"><PanelLeftOpen className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={() => onNavigate(null, 'Home')}><Home className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={onOpenSearch}><Search className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={onOpenTrash}><Trash2 className="w-4 h-4" /></button>
            </aside>
        );
    }

    return (
        <aside className="w-[302px] h-screen flex bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex-shrink-0">
            {/* Eden-like activity rail */}
            <div className="w-[56px] border-r border-[var(--sidebar-border)] bg-[var(--sidebar-icon-rail)] flex flex-col items-center py-3 gap-2">
                <button className="w-9 h-9 rounded-full bg-[var(--sidebar-accent)] text-white flex items-center justify-center shadow-sm" title="New">
                    <Plus className="w-5 h-5" />
                </button>
                <button className="icon-rail-btn" onClick={() => onNavigate(null, 'Home')}><Home className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={() => {}}><Clock3 className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={() => {}}><Boxes className="w-4 h-4" /></button>
                <button className="icon-rail-btn" onClick={() => {}}><Sparkles className="w-4 h-4" /></button>
                <div className="mt-auto" />
                <button className="icon-rail-btn" onClick={onToggleCollapse}><PanelLeftClose className="w-4 h-4" /></button>
                <button className="icon-rail-btn"><Settings className="w-4 h-4" /></button>
                <div className="w-9 h-9 rounded-full bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)] text-sm font-semibold flex items-center justify-center">
                    {user?.username?.[0]?.toUpperCase() || 'S'}
                </div>
            </div>

            {/* Main nav panel */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[var(--sidebar-border)]">
                    <span className="text-[31px] leading-none text-[var(--text-tertiary)]">Home</span>
                </div>

                <div className="px-3 py-2 border-b border-[var(--sidebar-border)]">
                    <button onClick={onOpenSearch} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]">
                        <Search className="w-3.5 h-3.5" /><span className="opacity-70">Search</span>
                    </button>
                </div>

                <div className="px-3 pt-2 pb-1">
                    <button onClick={() => onNavigate(null, 'Workspace')} className={`w-full text-left nav-item flex items-center gap-2.5 px-2.5 py-[8px] text-[30px] ${currentFolder === null ? 'active font-medium' : 'text-[var(--sidebar-text)]'}`}>
                        <Home className="w-4 h-4" />
                        Workspace
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-1">
                    <div className="flex items-center justify-between mb-1 px-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--sidebar-text)] opacity-60">Folders</span>
                        <button onClick={() => setShowNewFolder(true)} className="p-0.5 rounded hover:bg-[var(--sidebar-hover)] text-[var(--sidebar-text)]"><Plus className="w-3.5 h-3.5" /></button>
                    </div>

                    {showNewFolder && (
                        <div className="flex items-center gap-1.5 pl-2 pr-1 mb-2">
                            <input ref={inputRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }} placeholder="Folder name" className="flex-1 bg-transparent border-b border-[var(--sidebar-accent)] text-[13px] text-[var(--sidebar-text-active)] py-1 outline-none" />
                        </div>
                    )}

                    <Tree
                        className="bg-transparent rounded-md p-1"
                        initialExpandedItems={folderTree.map((f) => f.id)}
                        elements={folderTree}
                        onSelect={(id) => {
                            const picked = findNode(folderTree, id);
                            if (picked) onNavigate(Number(picked.id), picked.name);
                        }}
                    />
                </div>

                <div className="px-3 py-2 border-t border-[var(--sidebar-border)]">
                    <button onClick={onOpenTrash} className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><Trash2 className="w-4 h-4" />Trash</button>
                    {user?.is_admin && (
                        <button onClick={() => navigate('/admin')} className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><Shield className="w-4 h-4" />Admin</button>
                    )}
                    <button className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><HardDrive className="w-4 h-4" /><span>Storage</span><span className="ml-auto text-[10px] opacity-60">{formatSize(storage.used)} / {formatSize(storage.total)}</span></button>
                    <div className="mx-2.5 mb-2 h-1 bg-[var(--sidebar-border)] rounded-full overflow-hidden"><div className="h-full bg-[var(--sidebar-accent)]" style={{ width: `${Math.min(100, (storage.used / storage.total) * 100)}%` }} /></div>
                </div>
            </div>
        </aside>
    );
}

function convertFolderToTreeNode(folder) {
    return {
        id: String(folder.id),
        isSelectable: true,
        name: folder.name,
        children: (folder.children || []).map(convertFolderToTreeNode),
    };
}

function findNode(nodes, id) {
    for (const n of nodes) {
        if (String(n.id) === String(id)) return n;
        if (n.children?.length) {
            const c = findNode(n.children, id);
            if (c) return c;
        }
    }
    return null;
}
