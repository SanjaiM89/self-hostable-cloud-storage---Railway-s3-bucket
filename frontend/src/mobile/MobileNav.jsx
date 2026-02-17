import { useState } from 'react';
import { Home, Search, Plus, Trash2, Settings, Upload, FolderPlus, FileText, Sheet, MonitorPlay, Code, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/* ═══ Create Bottom Sheet ═══ */
function CreateSheet({ open, onClose, onUpload, onCreateFolder, onCreateDocument }) {
    if (!open) return null;

    const fileInputRef = { current: null };
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) onUpload(files);
        e.target.value = '';
        onClose();
    };

    const items = [
        { icon: Upload, label: 'Upload File', action: () => fileInputRef.current?.click(), color: '#89b4fa' },
        { icon: FolderPlus, label: 'New Folder', action: () => { onCreateFolder(); onClose(); }, color: '#a6e3a1' },
        { icon: FileText, label: 'New Writer', action: () => { onCreateDocument('Untitled Document', 'writer'); onClose(); }, color: '#89b4fa' },
        { icon: Sheet, label: 'New Spreadsheet', action: () => { onCreateDocument('Untitled Spreadsheet', 'spreadsheet'); onClose(); }, color: '#a6e3a1' },
        { icon: MonitorPlay, label: 'New Presentation', action: () => { onCreateDocument('Untitled Presentation', 'presentation'); onClose(); }, color: '#fab387' },
        { icon: Code, label: 'New Markdown', action: () => { onCreateDocument('Untitled', 'markdown'); onClose(); }, color: '#94e2d5' },
    ];

    return (
        <div className="fixed inset-0 z-[70]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                className="absolute bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-2xl border-t border-[var(--border-color)] shadow-2xl animate-slide-up"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideUp 0.25s ease-out' }}
            >
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
                </div>
                <div className="flex items-center justify-between px-5 pb-2">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Create New</h3>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--text-tertiary)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <input ref={(el) => fileInputRef.current = el} type="file" multiple className="hidden" onChange={handleFileSelect} />
                <div className="grid grid-cols-3 gap-1 px-4 pb-6">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.action}
                            className="flex flex-col items-center gap-2 py-4 rounded-xl hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] transition-colors"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center">
                                <item.icon className="w-5 h-5" style={{ color: item.color }} />
                            </div>
                            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══ Settings Sheet ═══ */
function SettingsSheet({ open, onClose, onNavigateSettings, onLogout }) {
    const { isDark, toggleTheme } = useTheme();
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                className="absolute bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-2xl border-t border-[var(--border-color)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideUp 0.25s ease-out' }}
            >
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
                </div>
                <div className="px-4 pb-6 space-y-1">
                    <button
                        onClick={() => { toggleTheme(); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] transition-colors"
                    >
                        {isDark ? <Sun className="w-5 h-5 text-[var(--text-tertiary)]" /> : <Moon className="w-5 h-5 text-[var(--text-tertiary)]" />}
                        <span className="text-[14px] text-[var(--text-primary)]">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                    {onNavigateSettings && (
                        <button
                            onClick={() => { onNavigateSettings(); onClose(); }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-[var(--bg-secondary)] active:bg-[var(--bg-secondary)] transition-colors"
                        >
                            <Settings className="w-5 h-5 text-[var(--text-tertiary)]" />
                            <span className="text-[14px] text-[var(--text-primary)]">Settings</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ═══ Main MobileNav ═══ */
export default function MobileNav({
    activeTab = 'home',
    onHome,
    onSearch,
    onUpload,
    onCreateFolder,
    onCreateDocument,
    onTrash,
    onNavigateSettings,
    onLogout,
}) {
    const [createOpen, setCreateOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const tabs = [
        { id: 'home', icon: Home, label: 'Home', action: onHome },
        { id: 'search', icon: Search, label: 'Search', action: onSearch },
        { id: 'create', icon: Plus, label: '', action: () => setCreateOpen(true) },
        { id: 'trash', icon: Trash2, label: 'Trash', action: onTrash },
        { id: 'settings', icon: Settings, label: 'More', action: () => setSettingsOpen(true) },
    ];

    return (
        <>
            <nav
                className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-[var(--card-bg)] border-t border-[var(--border-color)] backdrop-blur-lg"
                style={{ height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                {tabs.map((tab) => {
                    const isCreate = tab.id === 'create';
                    const isActive = activeTab === tab.id && !isCreate;

                    return (
                        <button
                            key={tab.id}
                            onClick={tab.action}
                            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${isCreate ? '' : isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                                }`}
                        >
                            {isCreate ? (
                                <div className="w-11 h-11 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg -mt-4">
                                    <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
                                </div>
                            ) : (
                                <>
                                    <tab.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                                    <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                                </>
                            )}
                        </button>
                    );
                })}
            </nav>

            <CreateSheet
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onUpload={onUpload}
                onCreateFolder={onCreateFolder}
                onCreateDocument={onCreateDocument}
            />

            <SettingsSheet
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onNavigateSettings={onNavigateSettings}
                onLogout={onLogout}
            />

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </>
    );
}
