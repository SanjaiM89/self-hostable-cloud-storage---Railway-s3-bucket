import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Home, Clock, Trash2, Settings, ChevronRight, ChevronDown,
    Folder, FolderOpen, Plus, Search, HardDrive, Cloud, Star,
    PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { filesAPI } from '../utils/api';

function FolderTreeItem({ folder, level = 0, currentFolder, onNavigate, expanded, onToggle }) {
    const isActive = currentFolder === folder.id;
    const isOpen = expanded[folder.id];
    const hasChildren = folder.children && folder.children.length > 0;

    return (
        <div>
            <button
                onClick={() => {
                    onNavigate(folder.id, folder.name);
                    if (hasChildren) onToggle(folder.id);
                }}
                className={`w-full flex items-center gap-1.5 py-1 px-2 text-[13px] rounded-md transition-all duration-100 group
          ${isActive
                        ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)]'
                        : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)]'
                    }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                {hasChildren ? (
                    isOpen ? <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" /> : <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                ) : (
                    <span className="w-3 h-3 flex-shrink-0" />
                )}
                {isActive || isOpen ? (
                    <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-[var(--sidebar-accent)]" />
                ) : (
                    <Folder className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                )}
                <span className="truncate">{folder.name}</span>
            </button>
            <AnimatePresence>
                {isOpen && hasChildren && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        {folder.children.map((child) => (
                            <FolderTreeItem
                                key={child.id}
                                folder={child}
                                level={level + 1}
                                currentFolder={currentFolder}
                                onNavigate={onNavigate}
                                expanded={expanded}
                                onToggle={onToggle}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function Sidebar({ currentFolder, onNavigate, onCreateFolder, collapsed, onToggleCollapse }) {
    const [expanded, setExpanded] = useState({});
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [storage, setStorage] = useState({ used: 0, total: 2 * 1024 * 1024 * 1024 });
    const [folderTree, setFolderTree] = useState([]);
    const inputRef = useRef(null);

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const fetchTree = useCallback(async () => {
        try {
            const [treeRes, storageRes] = await Promise.all([
                filesAPI.tree(),
                filesAPI.storage()
            ]);
            setFolderTree(treeRes.data || []);
            setStorage(storageRes.data);
        } catch (e) {
            console.error('Failed to load sidebar data:', e);
        }
    }, []);

    useEffect(() => {
        fetchTree();
    }, [fetchTree]);

    // Re-fetch tree when a folder is created
    useEffect(() => {
        fetchTree();
    }, [currentFolder, fetchTree]);

    const handleToggle = (id) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    useEffect(() => {
        if (showNewFolder && inputRef.current) inputRef.current.focus();
    }, [showNewFolder]);

    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            onCreateFolder(newFolderName.trim());
            setNewFolderName('');
            setShowNewFolder(false);
            setTimeout(fetchTree, 500);
        }
    };

    const navItems = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'recent', icon: Clock, label: 'Recent' },
        { id: 'starred', icon: Star, label: 'Starred' },
        { id: 'trash', icon: Trash2, label: 'Trash' },
    ];

    // Collapsed sidebar — icon rail
    if (collapsed) {
        return (
            <aside className="w-[52px] h-screen flex flex-col items-center bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] select-none py-2 gap-1 flex-shrink-0">
                <button
                    onClick={onToggleCollapse}
                    className="icon-rail-btn mb-2"
                    title="Expand sidebar"
                >
                    <PanelLeftOpen className="w-4 h-4" />
                </button>
                <div className="w-7 h-7 rounded-lg bg-[var(--sidebar-accent)] flex items-center justify-center mb-3">
                    <Cloud className="w-4 h-4 text-[var(--sidebar-bg)]" />
                </div>
                {navItems.map((item) => (
                    <button key={item.id} className="icon-rail-btn" title={item.label}>
                        <item.icon className="w-4 h-4" />
                    </button>
                ))}
                <div className="flex-1" />
                <button className="icon-rail-btn" title="Settings">
                    <Settings className="w-4 h-4" />
                </button>
            </aside>
        );
    }

    return (
        <aside className="w-[240px] h-screen flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] select-none flex-shrink-0">
            {/* Logo / Brand + collapse */}
            <div className="flex items-center gap-2.5 px-4 h-[52px] flex-shrink-0 border-b border-[var(--sidebar-border)]">
                <div className="w-7 h-7 rounded-lg bg-[var(--sidebar-accent)] flex items-center justify-center">
                    <Cloud className="w-4 h-4 text-[var(--sidebar-bg)]" />
                </div>
                <span className="text-[14px] font-semibold text-[var(--sidebar-text-active)] flex-1">Workspace</span>
                <button
                    onClick={onToggleCollapse}
                    className="p-1 rounded-md text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-hover)] transition-colors"
                    title="Collapse sidebar"
                >
                    <PanelLeftClose className="w-4 h-4" />
                </button>
            </div>

            {/* Quick search */}
            <div className="px-3 py-2 border-b border-[var(--sidebar-border)]">
                <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)] transition-colors">
                    <Search className="w-3.5 h-3.5" />
                    <span className="opacity-70">Search</span>
                    <span className="ml-auto text-[10px] opacity-40 border border-[var(--sidebar-border)] rounded px-1 py-0.5">⌘K</span>
                </button>
            </div>

            {/* Navigation */}
            <div className="px-3 py-2 flex flex-col gap-0.5">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            if (item.id === 'home') onNavigate(null, 'Home');
                        }}
                        className={`nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] w-full
              ${item.id === 'home' && currentFolder === null ? 'active font-medium' : 'text-[var(--sidebar-text)]'}`}
                    >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>

            {/* Separator */}
            <div className="mx-3 my-1 h-px bg-[var(--sidebar-border)]" />

            {/* Folder tree */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
                <div className="flex items-center justify-between mb-1 px-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--sidebar-text)] opacity-50">Folders</span>
                    <button
                        onClick={() => setShowNewFolder(true)}
                        className="p-0.5 rounded hover:bg-[var(--sidebar-hover)] text-[var(--sidebar-text)] hover:text-[var(--sidebar-accent)] transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>

                <AnimatePresence>
                    {showNewFolder && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mb-1"
                        >
                            <div className="flex items-center gap-1.5 pl-2 pr-1">
                                <Folder className="w-3.5 h-3.5 text-[var(--sidebar-accent)] flex-shrink-0" />
                                <input
                                    ref={inputRef}
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                                    }}
                                    onBlur={() => { if (!newFolderName.trim()) setShowNewFolder(false); }}
                                    placeholder="Folder name"
                                    className="flex-1 bg-transparent border-b border-[var(--sidebar-accent)] text-[13px] text-[var(--sidebar-text-active)] placeholder:text-[var(--sidebar-text)] placeholder:opacity-40 py-1 outline-none"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {folderTree.map((folder) => (
                    <FolderTreeItem
                        key={folder.id}
                        folder={folder}
                        currentFolder={currentFolder}
                        onNavigate={onNavigate}
                        expanded={expanded}
                        onToggle={handleToggle}
                    />
                ))}
            </div>

            {/* Bottom section */}
            <div className="px-3 py-2 border-t border-[var(--sidebar-border)]">
                <button className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full">
                    <HardDrive className="w-4 h-4" />
                    <span>Storage</span>
                    <span className="ml-auto text-[10px] text-[var(--sidebar-text)] opacity-50">
                        {formatSize(storage.used)} / {formatSize(storage.total)}
                    </span>
                </button>
                {/* Progress bar */}
                <div className="mx-2.5 mb-2 h-1 bg-[var(--sidebar-border)] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[var(--sidebar-accent)] transition-all duration-500"
                        style={{ width: `${Math.min(100, (storage.used / storage.total) * 100)}%` }}
                    />
                </div>
                <button className="nav-item flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] text-[var(--sidebar-text)] w-full">
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                </button>
            </div>
        </aside>
    );
}
