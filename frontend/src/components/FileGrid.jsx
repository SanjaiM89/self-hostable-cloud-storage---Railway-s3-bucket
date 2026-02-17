import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    File, FileText, Image, Film, Music, Archive, Code,
    Folder, FolderOpen, MoreVertical, Download, Pencil, Trash2,
    FileSpreadsheet, FileImage, Presentation, FolderPlus, Upload,
    FileType, Sheet, MonitorPlay, PackageOpen, RefreshCw, Share2
} from 'lucide-react';
import { filesAPI } from '../utils/api';
import ShareModal from './ShareModal';
import InputModal from './InputModal';
import { useMobile } from '../mobile';

const getFileIcon = (file) => {
    if (file.is_folder) return { icon: Folder, color: '#a6e3a1' };
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const mime = file.mime_type || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext) || mime.startsWith('image/'))
        return { icon: FileImage, color: '#f38ba8' };
    if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext) || mime.startsWith('video/'))
        return { icon: Film, color: '#cba6f7' };
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext) || mime.startsWith('audio/'))
        return { icon: Music, color: '#f9e2af' };
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
        return { icon: Archive, color: '#fab387' };
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'rb', 'go', 'rs', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh'].includes(ext))
        return { icon: Code, color: '#94e2d5' };
    if (['doc', 'docx', 'odt', 'rtf', 'txt', 'pdf'].includes(ext))
        return { icon: FileText, color: '#89b4fa' };
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext))
        return { icon: FileSpreadsheet, color: '#a6e3a1' };
    if (['ppt', 'pptx', 'odp'].includes(ext))
        return { icon: Presentation, color: '#fab387' };
    return { icon: File, color: '#a6adc8' };
};

const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    // Backend stores UTC timestamps — ensure the browser parses them as UTC
    let utcStr = dateStr;
    if (!utcStr.endsWith('Z') && !utcStr.includes('+') && !utcStr.includes('T')) {
        utcStr = utcStr.replace(' ', 'T') + 'Z';
    } else if (!utcStr.endsWith('Z') && utcStr.includes('T') && !utcStr.includes('+')) {
        utcStr = utcStr + 'Z';
    }
    const d = new Date(utcStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const isZip = (file) => file.name?.toLowerCase().endsWith('.zip');

/* ─── Generic context menu ─── */
function ContextMenu({ x, y, items, onClose }) {
    const menuRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Keep menu in viewport
    const [pos, setPos] = useState({ left: x, top: y });
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let left = x, top = y;
            if (x + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8;
            if (y + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8;
            setPos({ left, top });
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="context-menu fixed z-50 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xl min-w-[180px]"
            style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        >
            {items.map((item, i) =>
                item.divider ? (
                    <div key={i} className="my-1 mx-2 h-px bg-[var(--border-color)]" />
                ) : (
                    <button
                        key={i}
                        onClick={() => { item.action(); onClose(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors
              ${item.danger
                                ? 'text-[var(--danger)] hover:bg-red-500/10'
                                : 'text-[var(--text-primary)] hover:bg-[var(--card-hover)]'
                            }`}
                    >
                        {item.icon && <item.icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
                        {item.label}
                    </button>
                )
            )}
        </div>
    );
}



/* ─── Folder Hover Preview ─── */
function FolderPreview({ folderId, x, y }) {
    const [files, setFiles] = useState(null);

    useEffect(() => {
        let cancelled = false;
        filesAPI.folderPreview(folderId).then((res) => {
            if (!cancelled) setFiles(res.data || []);
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [folderId]);

    if (!files) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed z-40 p-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xl min-w-[200px] max-w-[260px]"
            style={{ left: `${x}px`, top: `${y + 8}px` }}
        >
            {files.length === 0 ? (
                <p className="text-[11px] text-[var(--text-tertiary)] px-1">Empty folder</p>
            ) : (
                <>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 px-1">Recent files</p>
                    {files.map((f) => {
                        const { icon: Icon, color } = getFileIcon(f);
                        return (
                            <div key={f.id} className="flex items-center gap-2 px-1 py-1">
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                                <span className="text-[12px] text-[var(--text-primary)] truncate">{f.name}</span>
                                <span className="text-[10px] text-[var(--text-tertiary)] ml-auto flex-shrink-0">{formatSize(f.size)}</span>
                            </div>
                        );
                    })}
                </>
            )}
        </motion.div>
    );
}

/* ─── File Card (Grid view) ─── */
function FileCard({ file, onOpen, onContextMenu, index, selected, onClickItem }) {
    const [hoverPreview, setHoverPreview] = useState(null);
    const hoverTimeout = useRef(null);
    const { icon: Icon, color } = getFileIcon(file);
    const isMobile = useMobile();

    const handleMouseEnter = (e) => {
        if (isMobile) return;
        if (file.is_folder) {
            // Capture the element NOW — e.currentTarget becomes null after the handler returns
            const el = e.currentTarget;
            hoverTimeout.current = setTimeout(() => {
                if (!el) return;
                const rect = el.getBoundingClientRect();
                setHoverPreview({ x: rect.left, y: rect.bottom });
            }, 500);
        }
    };
    const handleMouseLeave = () => {
        clearTimeout(hoverTimeout.current);
        setHoverPreview(null);
    };

    return (
        <>
            <motion.div data-file-id={file.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className={`file-card group relative rounded-2xl border bg-[var(--card-bg)] cursor-pointer overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.03)] ${selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--card-border)]"}`}
                onClick={(e) => onClickItem(e, file)}
                onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, file); }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="h-[170px] flex items-center justify-center bg-[var(--bg-secondary)]">
                    {file.is_folder ? (
                        <Icon className="w-14 h-14 app-icon-solid" style={{ color }} strokeWidth={1.5} />
                    ) : (
                        <div className="w-[78%] h-[88%] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-center">
                            <Icon className="w-10 h-10 app-icon-solid" style={{ color }} strokeWidth={1.5} />
                        </div>
                    )}
                </div>
                <div className="px-3 py-2.5">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{file.name}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        {file.is_folder ? 'Folder' : formatSize(file.size)} · {formatDate(file.created_at)}
                    </p>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
                    className="absolute top-2 right-2 p-1 rounded-md bg-[var(--card-bg)]/80 backdrop-blur opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
                >
                    <MoreVertical className="w-4 h-4 app-icon-solid" />
                </button>
            </motion.div>

            {hoverPreview && file.is_folder && (
                <FolderPreview folderId={file.id} x={hoverPreview.x} y={hoverPreview.y} />
            )}
        </>
    );
}

/* ─── File Row (List view) ─── */
function FileRow({ file, onOpen, onContextMenu, index, selected, onClickItem }) {
    const { icon: Icon, color } = getFileIcon(file);

    return (
        <motion.div data-file-id={file.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
            className={`file-card group flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer ${selected ? "border-[var(--accent)] bg-[var(--accent-light)]" : "border-transparent"}`}
            onClick={(e) => onClickItem(e, file)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, file); }}
        >
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 app-icon-solid" style={{ color }} strokeWidth={1.5} />
            </div>
            <span className="flex-1 text-[13px] text-[var(--text-primary)] truncate font-medium">{file.name}</span>
            <span className="hidden sm:block text-[12px] text-[var(--text-tertiary)] w-[80px] text-right">{file.is_folder ? '—' : formatSize(file.size)}</span>
            <span className="hidden md:block text-[12px] text-[var(--text-tertiary)] w-[80px] text-right">{formatDate(file.created_at)}</span>
            <button
                onClick={(e) => { e.stopPropagation(); onContextMenu(e, file); }}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
            >
                <MoreVertical className="w-4 h-4 app-icon-solid" />
            </button>
        </motion.div>
    );
}

/* ─── Main FileGrid ─── */
export default function FileGrid({
    files, onOpen, onDownload, onDelete, onRename, onExtract,
    onCreateFolder, onUpload, onCreateDocument, onRefresh,
    viewMode = 'grid',
    onSelectionChange,

    onMobileAction,
    onShare,
}) {
    const [ctxMenu, setCtxMenu] = useState(null);
    const [inputModal, setInputModal] = useState(null); // { title, placeholder, defaultValue, onConfirm }
    // const [shareModal, setShareModal] = useState(null); // REMOVED: Hoisted to Dashboard
    const fileInputRef = useRef(null);
    const rootRef = useRef(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectionRect, setSelectionRect] = useState(null);
    const dragStartRef = useRef(null);
    const isMobile = useMobile();

    const handleContextMenu = (e, file = null) => {
        e.preventDefault();
        if (isMobile && file && onMobileAction) {
            onMobileAction(file);
            return;
        }
        const items = [];

        if (file) {
            // File-specific menu
            if (!file.is_folder) {
                items.push({ icon: Download, label: 'Download', action: () => onDownload(file) });
            }
            items.push({ icon: Share2, label: 'Share', action: () => onShare(file) });
            items.push({ icon: Pencil, label: 'Rename', action: () => onRename(file) });
            if (!file.is_folder && isZip(file)) {
                items.push({ icon: PackageOpen, label: 'Extract ZIP', action: () => onExtract(file) });
            }
            items.push({ divider: true });
            items.push({ icon: Trash2, label: 'Delete', danger: true, action: () => onDelete(file) });
        } else {
            // Background menu (Eden style)
            items.push({
                icon: FolderPlus, label: 'New Folder', action: () => {
                    setInputModal({
                        title: 'Create New Folder',
                        placeholder: 'Folder name',
                        defaultValue: '',
                        onConfirm: (name) => { setInputModal(null); onCreateFolder(name); },
                    });
                }
            });
            items.push({ icon: Upload, label: 'Upload File', action: () => fileInputRef.current?.click() });
            items.push({ divider: true });
            items.push({
                icon: FileType, label: 'New Writer', action: () => {
                    setInputModal({
                        title: 'Create Writer Document',
                        placeholder: 'Document name',
                        defaultValue: 'Untitled Document',
                        onConfirm: (name) => { setInputModal(null); onCreateDocument(name, 'writer'); },
                    });
                }
            });
            items.push({
                icon: Sheet, label: 'New Spreadsheet', action: () => {
                    setInputModal({
                        title: 'Create Spreadsheet',
                        placeholder: 'Spreadsheet name',
                        defaultValue: 'Untitled Spreadsheet',
                        onConfirm: (name) => { setInputModal(null); onCreateDocument(name, 'spreadsheet'); },
                    });
                }
            });
            items.push({
                icon: MonitorPlay, label: 'New Presentation', action: () => {
                    setInputModal({
                        title: 'Create Presentation',
                        placeholder: 'Presentation name',
                        defaultValue: 'Untitled Presentation',
                        onConfirm: (name) => { setInputModal(null); onCreateDocument(name, 'presentation'); },
                    });
                }
            });
            items.push({
                icon: Code, label: 'New Markdown', action: () => {
                    setInputModal({
                        title: 'Create Markdown File',
                        placeholder: 'File name',
                        defaultValue: 'Untitled',
                        onConfirm: (name) => { setInputModal(null); onCreateDocument(name, 'markdown'); },
                    });
                }
            });
            items.push({ divider: true });
            items.push({ icon: RefreshCw, label: 'Refresh', action: onRefresh });
        }

        setCtxMenu({ x: e.clientX, y: e.clientY, items });
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) onUpload(files);
        e.target.value = '';
    };


    useEffect(() => {
        onSelectionChange?.(files.filter((f) => selectedIds.includes(f.id)));
    }, [selectedIds, files, onSelectionChange]);

    const handleItemClick = (e, file) => {
        if (e.ctrlKey || e.metaKey) {
            setSelectedIds((prev) => prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id]);
            return;
        }
        if (selectedIds.length > 0) {
            setSelectedIds([file.id]);
            return;
        }
        onOpen(file);
    };

    const onMouseDownCapture = (e) => {
        if (e.button !== 0 || e.target.closest('.file-card')) return;
        const bounds = rootRef.current?.getBoundingClientRect();
        if (!bounds) return;
        dragStartRef.current = { x: e.clientX, y: e.clientY, bounds };
        setSelectedIds([]);
        setSelectionRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    };

    const onMouseMoveCapture = (e) => {
        if (!dragStartRef.current || !rootRef.current) return;
        const start = dragStartRef.current;
        const left = Math.min(start.x, e.clientX);
        const top = Math.min(start.y, e.clientY);
        const width = Math.abs(e.clientX - start.x);
        const height = Math.abs(e.clientY - start.y);
        setSelectionRect({ left, top, width, height });

        const rect = { left, top, right: left + width, bottom: top + height };
        const cards = Array.from(rootRef.current.querySelectorAll('.file-card[data-file-id]'));
        const hit = cards.filter((el) => {
            const r = el.getBoundingClientRect();
            return !(rect.right < r.left || rect.left > r.right || rect.bottom < r.top || rect.top > r.bottom);
        }).map((el) => Number(el.dataset.fileId));
        setSelectedIds(hit);
    };

    const onMouseUpCapture = () => {
        dragStartRef.current = null;
        setTimeout(() => setSelectionRect(null), 50);
    };

    // Intercept ALL right-clicks in the content area
    const handleBgContextMenu = (e) => {
        // If the click was on a file card, the card's own handler fires first (it stops propagation via e.preventDefault)
        // But we always prevent the native menu at this level
        e.preventDefault();
        // Only show background menu if the click wasn't on a file card
        const fileCard = e.target.closest('.file-card');
        if (!fileCard) {
            handleContextMenu(e, null);
        }
    };

    // Empty state
    if (!files || files.length === 0) {
        return (
            <div
                className="h-full min-h-[400px]"
                onContextMenu={handleBgContextMenu}
            >
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center mb-4">
                        <Folder className="w-8 h-8 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                    </div>
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">No files yet</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Right-click to create files or folders</p>
                </div>
                {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}
                {inputModal && <InputModal {...inputModal} onCancel={() => setInputModal(null)} />}
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className="min-h-[400px] pb-20 relative"
            onContextMenu={handleBgContextMenu}
            onMouseDown={onMouseDownCapture}
            onMouseMove={onMouseMoveCapture}
            onMouseUp={onMouseUpCapture}
        >
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

            {viewMode === 'list' ? (
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        <span className="w-8" />
                        <span className="flex-1">Name</span>
                        <span className="w-[80px] text-right">Size</span>
                        <span className="w-[80px] text-right">Modified</span>
                        <span className="w-6" />
                    </div>
                    {files.map((file, i) => (
                        <FileRow key={file.id} file={file} index={i} onOpen={onOpen} onContextMenu={handleContextMenu} selected={selectedIds.includes(file.id)} onClickItem={handleItemClick} />
                    ))}
                </div>
            ) : (
                <div data-grid-bg className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {files.map((file, i) => (
                        <FileCard key={file.id} file={file} index={i} onOpen={onOpen} onContextMenu={handleContextMenu} selected={selectedIds.includes(file.id)} onClickItem={handleItemClick} />
                    ))}
                </div>
            )}

            {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}
            {inputModal && <InputModal {...inputModal} onCancel={() => setInputModal(null)} />}
            {selectionRect && <div className="fixed border border-[var(--accent)] bg-[var(--accent-light)] pointer-events-none z-30" style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }} />}
            {/* ShareModal hoisted to Dashboard */}
        </div>
    );
}
