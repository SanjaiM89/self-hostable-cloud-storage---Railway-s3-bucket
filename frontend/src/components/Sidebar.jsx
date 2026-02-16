import { useEffect, useMemo, useRef, useState } from 'react';
import { Home, Trash2, Settings, Plus, Search, HardDrive, Shield, PanelLeftClose, PanelLeftOpen, Upload, FileText, Sheet, MonitorPlay, Code, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { filesAPI } from '../utils/api';
import { Tree } from './ui/file-tree';

export default function Sidebar({ currentFolder, onNavigate, onCreateFolder, onUpload, onCreateDocument, collapsed, onToggleCollapse, onOpenTrash, onOpenSearch }) {
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [quickOpen, setQuickOpen] = useState(false);
    const [storage, setStorage] = useState({ used: 0, total: 2 * 1024 * 1024 * 1024 });
    const [folderTree, setFolderTree] = useState([]);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = Number(localStorage.getItem('sidebar_width_v1'));
        return Number.isFinite(saved) ? Math.min(460, Math.max(260, saved)) : 302;
    });
    const resizingRef = useRef(false);
    const inputRef = useRef(null);
    const quickUploadRef = useRef(null);
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

    useEffect(() => {
        const onMove = (e) => {
            if (!resizingRef.current) return;
            const next = Math.min(460, Math.max(260, e.clientX));
            setSidebarWidth(next);
            localStorage.setItem('sidebar_width_v1', String(next));
        };
        const onUp = () => { resizingRef.current = false; document.body.style.cursor = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        onCreateFolder(newFolderName.trim());
        setNewFolderName('');
        setShowNewFolder(false);
        setTimeout(fetchTree, 300);
    };



    const handleQuickUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) onUpload?.(files);
        e.target.value = '';
        setQuickOpen(false);
    };

    const quickCreate = (docType, fallbackName) => {
        const name = window.prompt('Enter name:', fallbackName);
        if (name && name.trim()) {
            onCreateDocument?.(name.trim(), docType);
        }
        setQuickOpen(false);
    };

    if (collapsed) {
        return (
            <aside className="w-[56px] h-screen flex flex-col items-center bg-[var(--sidebar-icon-rail)] border-r border-[var(--sidebar-border)] py-3 gap-2 flex-shrink-0">
                <button onClick={onToggleCollapse} className="icon-rail-btn" title="Expand sidebar"><PanelLeftOpen className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={() => onNavigate(null, 'Home')}><Home className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={onOpenSearch}><Search className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={onOpenTrash}><Trash2 className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
            </aside>
        );
    }

    return (
        <aside className="h-screen flex bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex-shrink-0 relative" style={{ width: `${sidebarWidth}px` }}>
            {/* Eden-like activity rail */}
            <div className="relative w-[56px] border-r border-[var(--sidebar-border)] bg-[var(--sidebar-icon-rail)] flex flex-col items-center py-3 gap-2">
                <button className="w-9 h-9 rounded-full bg-[var(--sidebar-accent)] text-white flex items-center justify-center shadow-sm" title="New" onClick={() => setQuickOpen((v) => !v)}>
                    <Plus className="w-5 h-5 app-icon-solid" strokeWidth={2.35} />
                </button>
                <button className="icon-rail-btn" onClick={() => onNavigate(null, 'Home')}><Home className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <div className="mt-auto" />
                <button className="icon-rail-btn" onClick={onToggleCollapse}><PanelLeftClose className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={() => navigate('/settings')}><Settings className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <div className="w-9 h-9 rounded-full bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)] text-sm font-semibold flex items-center justify-center">
                    {user?.username?.[0]?.toUpperCase() || 'S'}
                </div>

                {quickOpen && (
                    <div className="absolute left-[62px] top-3 z-40 w-56 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xl p-1.5">
                        <input ref={quickUploadRef} type="file" multiple className="hidden" onChange={handleQuickUpload} />
                        <button onClick={() => quickUploadRef.current?.click()} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Upload className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />Upload</button>
                        <button onClick={() => quickCreate('writer', 'Untitled Document')} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><FileText className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Writer</button>
                        <button onClick={() => quickCreate('spreadsheet', 'Untitled Spreadsheet')} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Sheet className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Spreadsheet</button>
                        <button onClick={() => quickCreate('presentation', 'Untitled Presentation')} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><MonitorPlay className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New PPT</button>
                        <button onClick={() => { setShowNewFolder(true); setQuickOpen(false); }} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Plus className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Folder</button>
                        <button onClick={() => quickCreate('markdown', 'Untitled')} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Code className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Markdown</button>
                    </div>
                )}
            </div>

            {/* Main nav panel */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[var(--sidebar-border)]">
                    <button onClick={() => onNavigate(null, 'Home')} className="text-[31px] leading-none text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Home</button>
                </div>

                <div className="px-3 py-2 border-b border-[var(--sidebar-border)]">
                    <button onClick={onOpenSearch} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]">
                        <Search className="w-3.5 h-3.5 app-icon-solid" strokeWidth={2.35} /><span className="opacity-70">Search</span>
                    </button>
                </div>

                <div className="px-3 pt-2 pb-1">
                    <button onClick={() => onNavigate(null, 'Workspace')} className={`w-full text-left nav-item flex items-center gap-2.5 px-2.5 py-[8px] text-[30px] ${currentFolder === null ? 'active font-medium' : 'text-[var(--sidebar-text)]'}`}>
                        <Home className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />
                        Workspace
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-1">
                    <div className="flex items-center justify-between mb-1 px-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--sidebar-text)] opacity-60">Folders</span>
                        <button onClick={() => setShowNewFolder(true)} className="p-0.5 rounded hover:bg-[var(--sidebar-hover)] text-[var(--sidebar-text)]"><Plus className="w-3.5 h-3.5 app-icon-solid" strokeWidth={2.35} /></button>
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
                    <button onClick={onOpenTrash} className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><Trash2 className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />Trash</button>
                    {user?.is_admin && (
                        <button onClick={() => navigate('/admin')} className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><Shield className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />Admin</button>
                    )}
                    <button className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full"><HardDrive className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /><span>Storage</span><span className="ml-auto text-[10px] opacity-60">{formatSize(storage.used)} / {formatSize(storage.total)}</span></button>
                    <div className="mx-2.5 mb-2 h-1 bg-[var(--sidebar-border)] rounded-full overflow-hidden"><div className="h-full bg-[var(--sidebar-accent)]" style={{ width: `${Math.min(100, (storage.used / storage.total) * 100)}%` }} /></div>
                </div>
            </div>
            <button
                type="button"
                className="sidebar-resize-handle absolute right-0 top-0 h-full w-2 translate-x-1/2 z-20"
                title="Resize sidebar"
                onMouseDown={() => { resizingRef.current = true; document.body.style.cursor = 'col-resize'; }}
            >
                <span className="mx-auto my-2 block w-1 h-10 rounded-full bg-[var(--sidebar-border)] opacity-60" />
                <GripVertical className="mx-auto w-3 h-3 text-[var(--sidebar-text)] opacity-70" strokeWidth={2.3} />
            </button>
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
