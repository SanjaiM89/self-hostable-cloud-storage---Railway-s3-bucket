import { useEffect, useRef, useState } from 'react';
import {
    Download, Pencil, Trash2, Share2, PackageOpen, X,
    File, FileText, Image, Film, Music, Archive, Code,
    Folder, FileSpreadsheet, FileImage, Presentation
} from 'lucide-react';

const getIcon = (file) => {
    if (file.is_folder) return { icon: Folder, color: '#a6e3a1' };
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const mime = file.mime_type || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext) || mime.startsWith('image/'))
        return { icon: FileImage, color: '#f38ba8' };
    if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext) || mime.startsWith('video/'))
        return { icon: Film, color: '#cba6f7' };
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext) || mime.startsWith('audio/'))
        return { icon: Music, color: '#f9e2af' };
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
        return { icon: Archive, color: '#fab387' };
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json'].includes(ext))
        return { icon: Code, color: '#94e2d5' };
    if (['doc', 'docx', 'txt', 'pdf'].includes(ext))
        return { icon: FileText, color: '#89b4fa' };
    if (['xls', 'xlsx', 'csv'].includes(ext))
        return { icon: FileSpreadsheet, color: '#a6e3a1' };
    if (['ppt', 'pptx'].includes(ext))
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

export default function MobileActionSheet({
    file,
    onClose,
    onDownload,
    onRename,
    onDelete,
    onShare,
    onExtract,
}) {
    const sheetRef = useRef(null);
    const [dragY, setDragY] = useState(0);
    const startYRef = useRef(0);
    const draggingRef = useRef(false);

    useEffect(() => {
        // Lock body scroll
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    if (!file) return null;

    const { icon: FileIcon, color } = getIcon(file);
    const isZip = file.name?.toLowerCase().endsWith('.zip');

    const actions = [];
    if (!file.is_folder) {
        actions.push({ icon: Download, label: 'Download', action: () => { onDownload(file); onClose(); } });
    }
    actions.push({ icon: Share2, label: 'Share', action: () => { onShare(file); onClose(); } });
    actions.push({ icon: Pencil, label: 'Rename', action: () => { onRename(file); onClose(); } });
    if (!file.is_folder && isZip) {
        actions.push({ icon: PackageOpen, label: 'Extract ZIP', action: () => { onExtract(file); onClose(); } });
    }
    actions.push({ icon: Trash2, label: 'Delete', danger: true, action: () => { onDelete(file); onClose(); } });

    const handleTouchStart = (e) => {
        startYRef.current = e.touches[0].clientY;
        draggingRef.current = true;
    };
    const handleTouchMove = (e) => {
        if (!draggingRef.current) return;
        const dy = e.touches[0].clientY - startYRef.current;
        if (dy > 0) setDragY(dy);
    };
    const handleTouchEnd = () => {
        draggingRef.current = false;
        if (dragY > 100) {
            onClose();
        } else {
            setDragY(0);
        }
    };

    return (
        <div className="fixed inset-0 z-[70]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                ref={sheetRef}
                className="absolute bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-2xl border-t border-[var(--border-color)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                style={{
                    animation: 'slideUp 0.25s ease-out',
                    transform: `translateY(${dragY}px)`,
                    transition: draggingRef.current ? 'none' : 'transform 0.2s ease-out',
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
                </div>

                {/* File info header */}
                <div className="flex items-center gap-3 px-5 pb-3 border-b border-[var(--border-color)]">
                    <div className="w-11 h-11 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0">
                        <FileIcon className="w-6 h-6" style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{file.name}</p>
                        <p className="text-[12px] text-[var(--text-tertiary)]">
                            {file.is_folder ? 'Folder' : formatSize(file.size)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-[var(--text-tertiary)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Actions */}
                <div className="py-2 px-2 pb-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                    {actions.map((action, i) => (
                        <button
                            key={i}
                            onClick={action.action}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors active:bg-[var(--bg-secondary)] ${action.danger ? 'text-red-400' : 'text-[var(--text-primary)]'
                                }`}
                        >
                            <action.icon className={`w-5 h-5 ${action.danger ? 'text-red-400' : 'text-[var(--text-tertiary)]'}`} />
                            <span className="text-[14px] font-medium">{action.label}</span>
                        </button>
                    ))}
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
