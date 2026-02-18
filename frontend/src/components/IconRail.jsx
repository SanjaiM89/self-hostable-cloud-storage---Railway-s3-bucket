import { Plus, Home, Music, PanelLeftClose, PanelLeftOpen, Settings, Upload, FileText, Sheet, MonitorPlay, Code, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useMemo } from 'react';
import InputModal from './InputModal';

export default function IconRail({ onNavigate, onToggleCollapse, collapsed, onOpenTrash, onOpenSearch, onCreateFolder, onCreateDocument, onUpload }) {
    const navigate = useNavigate();
    const [quickOpen, setQuickOpen] = useState(false);
    const quickUploadRef = useRef(null);
    const user = useMemo(() => JSON.parse(localStorage.getItem('user') || 'null'), []);
    const [inputModal, setInputModal] = useState(null);

    const handleQuickUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) onUpload?.(files);
        e.target.value = '';
        setQuickOpen(false);
    };

    const quickCreate = (docType, fallbackName) => {
        const titles = {
            'writer': 'Create Writer Document',
            'spreadsheet': 'Create Spreadsheet',
            'presentation': 'Create Presentation',
            'markdown': 'Create Markdown File',
        };
        const placeholders = {
            'writer': 'Document name',
            'spreadsheet': 'Spreadsheet name',
            'presentation': 'Presentation name',
            'markdown': 'File name',
        };

        setInputModal({
            title: titles[docType],
            placeholder: placeholders[docType],
            defaultValue: fallbackName,
            onConfirm: (name) => {
                setInputModal(null);
                onCreateDocument?.(name.trim(), docType);
            },
            onCancel: () => setInputModal(null)
        });
        setQuickOpen(false);
    };

    const openNewFolderModal = () => {
        setInputModal({
            title: 'Create New Folder',
            placeholder: 'Folder name',
            defaultValue: '',
            onConfirm: (name) => {
                setInputModal(null);
                onCreateFolder?.(name);
            },
            onCancel: () => setInputModal(null)
        });
        setQuickOpen(false);
    };

    if (collapsed) {
        return (
            <aside className="w-[56px] h-screen flex flex-col items-center bg-[var(--sidebar-icon-rail)] border-r border-[var(--sidebar-border)] py-3 gap-2 flex-shrink-0 z-30">
                <button onClick={onToggleCollapse} className="icon-rail-btn" title="Expand sidebar"><PanelLeftOpen className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={() => onNavigate?.(null, 'Home')}><Home className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                {/* Ensure Music icon is present and works */}
                <button className="icon-rail-btn" onClick={() => navigate('/music')} title="Music Player"><Music className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={onOpenSearch}><Search className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
                <button className="icon-rail-btn" onClick={onOpenTrash}><Trash2 className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
            </aside>
        );
    }

    return (
        <div className="relative w-[56px] h-full border-r border-[var(--sidebar-border)] bg-[var(--sidebar-icon-rail)] flex flex-col items-center py-3 gap-2 z-30">
            <button className="w-9 h-9 rounded-full bg-[var(--sidebar-accent)] text-white flex items-center justify-center shadow-sm" title="New" onClick={() => setQuickOpen((v) => !v)}>
                <Plus className="w-5 h-5 app-icon-solid" strokeWidth={2.35} />
            </button>
            <button className="icon-rail-btn" onClick={() => onNavigate?.(null, 'Home')}><Home className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
            <button className="icon-rail-btn" onClick={() => navigate('/music')} title="Music Player"><Music className="w-4 h-4 app-icon-solid" strokeWidth={2.35} /></button>
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
                    <button onClick={openNewFolderModal} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Plus className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Folder</button>
                    <button onClick={() => quickCreate('markdown', 'Untitled')} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--bg-secondary)] text-sm flex items-center gap-2"><Code className="w-4 h-4 app-icon-solid" strokeWidth={2.35} />New Markdown</button>
                </div>
            )}

            {inputModal && <InputModal {...inputModal} />}
        </div>
    );
}
