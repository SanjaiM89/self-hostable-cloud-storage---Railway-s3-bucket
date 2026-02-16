import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
    Download, File, Lock, Folder, ChevronRight,
    Sun, Moon, FileText, Image, Film, Music,
    Archive, Code, Table, Database, FolderArchive,
    ArrowLeft, Eye, LayoutGrid, List, X,
} from 'lucide-react';
import { sharesAPI } from '../utils/api';
import MarkdownViewer from '../components/MarkdownViewer';
import PdfViewer from '../components/PdfViewer';
import Loader from '../components/Loader';

// ─── Helpers ───
function getFileIcon(file, size = 'w-5 h-5') {
    if (file.is_folder) return <Folder className={`${size} text-[var(--accent)]`} />;
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const mime = file.mime_type || '';
    if (mime.startsWith('image/') || /^(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/.test(ext))
        return <Image className={`${size} text-pink-400`} />;
    if (mime.startsWith('video/') || /^(mp4|webm|mov|avi|mkv)$/.test(ext))
        return <Film className={`${size} text-purple-400`} />;
    if (mime.startsWith('audio/') || /^(mp3|wav|ogg|m4a|flac|aac)$/.test(ext))
        return <Music className={`${size} text-cyan-400`} />;
    if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext))
        return <Archive className={`${size} text-amber-400`} />;
    if (/^(js|ts|jsx|tsx|py|java|c|cpp|rs|go|rb|php|html|css|json|xml|yaml|yml|sh|sql)$/.test(ext))
        return <Code className={`${size} text-green-400`} />;
    if (/^(xlsx?|csv|ods)$/.test(ext))
        return <Table className={`${size} text-emerald-400`} />;
    if (/^(db|sqlite|sql)$/.test(ext))
        return <Database className={`${size} text-orange-400`} />;
    if (/^(md|txt|rtf|doc|docx|pdf|odt)$/.test(ext))
        return <FileText className={`${size} text-blue-400`} />;
    return <File className={`${size} text-[var(--text-tertiary)]`} />;
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function flatCount(items) {
    let count = 0;
    for (const item of items) {
        if (item.is_folder && item.children) count += flatCount(item.children);
        else count++;
    }
    return count;
}

const isPdf = (name) => name?.toLowerCase().endsWith('.pdf');
const isMd = (name) => name?.toLowerCase().endsWith('.md');

// ─── Inline Markdown Viewer for folder files ───
function FolderMarkdownViewer({ token, fileId, fileName, onClose, darkMode }) {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await sharesAPI.publicFileContent(token, fileId);
                setContent(res.data.content);
            } catch (e) {
                setError('Failed to load file content');
            } finally {
                setLoading(false);
            }
        })();
    }, [token, fileId]);

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <Loader className="scale-50" />
        </div>
    );
    if (error) return (
        <div className="flex items-center justify-center h-full">
            <p className="text-red-400">{error}</p>
        </div>
    );

    return (
        <div className="h-screen w-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
            <div className="sf-topbar">
                <button onClick={onClose} className="sf-icon-btn mr-2"><ArrowLeft size={18} /></button>
                <FileText className="w-4 h-4 text-blue-400 mr-2" />
                <span className="text-[13px] font-medium truncate text-[var(--text-primary)]">{fileName}</span>
                <div className="flex-1" />
            </div>
            <div className="flex-1 overflow-auto">
                <MarkdownViewer token={token} fileInfo={{ name: fileName, file_id: fileId }} overrideContent={content} />
            </div>
        </div>
    );
}

// ─── Main Component ───
export default function SharedFilePage() {
    const { token } = useParams();
    const [fileInfo, setFileInfo] = useState(null);
    const [editorConfig, setEditorConfig] = useState(null);
    const [folderContents, setFolderContents] = useState(null);
    const [currentPath, setCurrentPath] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('shared_dark_mode') !== 'false');
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('shared_view_mode') || 'grid');
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    // Preview states
    const [pdfPreview, setPdfPreview] = useState(null);
    const [mdPreview, setMdPreview] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const editableExts = /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv|txt|rtf)$/i;
    const canDownload = fileInfo && fileInfo.permission !== 'view';

    // Persist preferences
    useEffect(() => {
        localStorage.setItem('shared_dark_mode', darkMode ? 'true' : 'false');
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    useEffect(() => {
        localStorage.setItem('shared_view_mode', viewMode);
    }, [viewMode]);

    // Load file info & folder contents
    useEffect(() => { loadFile(); }, [token]);

    const loadFile = async () => {
        try {
            const res = await sharesAPI.publicInfo(token);
            setFileInfo(res.data);

            if (res.data.is_folder) {
                try {
                    const contentsRes = await sharesAPI.publicContents(token);
                    setFolderContents(contentsRes.data.contents || []);
                } catch (e) {
                    console.error('Failed to load folder contents:', e);
                    setFolderContents([]);
                }
            } else if (isPdf(res.data.name)) {
                try {
                    const previewRes = await sharesAPI.publicPreview(token, res.data.file_id);
                    setPdfPreview({ file: res.data, url: previewRes.data.url });
                } catch (e) {
                    console.error('Failed to load PDF preview:', e);
                }
            } else if (editableExts.test(res.data.name)) {
                try {
                    const cfgRes = await sharesAPI.publicEditorConfig(token);
                    setEditorConfig(cfgRes.data);
                } catch (e) {
                    console.error('Editor config not available:', e);
                }
            }
        } catch (e) {
            setError(e.response?.data?.detail || 'This share link is invalid or expired.');
        } finally {
            setLoading(false);
        }
    };

    // Mount OnlyOffice editor
    useEffect(() => {
        if (!editorConfig || !editorContainerRef.current) return;
        const container = editorContainerRef.current;
        container.innerHTML = '';
        const editorDiv = document.createElement('div');
        editorDiv.id = 'shared-editor';
        editorDiv.style.height = '100%';
        editorDiv.style.width = '100%';
        container.appendChild(editorDiv);

        const initEditor = () => {
            if (editorInstanceRef.current) {
                try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
            }
            editorInstanceRef.current = new window.DocsAPI.DocEditor('shared-editor', editorConfig);
        };

        if (window.DocsAPI) {
            initEditor();
        } else {
            const script = document.createElement('script');
            script.src = `${import.meta.env.VITE_ONLYOFFICE_URL || 'http://localhost:8080'}/web-apps/apps/api/documents/api.js`;
            script.onload = initEditor;
            script.onerror = () => console.error('Failed to load OnlyOffice API');
            document.head.appendChild(script);
        }

        return () => {
            if (editorInstanceRef.current) {
                try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
                editorInstanceRef.current = null;
            }
            container.innerHTML = '';
        };
    }, [editorConfig]);

    // Download handlers
    const handleDownload = async () => {
        try {
            const res = await sharesAPI.publicDownload(token);
            window.open(res.data.url, '_blank');
        } catch (e) {
            setError(e.response?.data?.detail || 'Download not allowed');
        }
    };

    const handleDownloadFile = (fileId) => {
        const url = sharesAPI.publicDownloadFile(token, fileId);
        const a = document.createElement('a');
        a.href = url; a.download = '';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const handleDownloadZip = () => {
        const url = sharesAPI.publicDownloadZip(token);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileInfo?.name || 'folder'}.zip`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    // Open PDF from folder
    const openPdfFromFolder = async (item) => {
        setPdfLoading(true);
        try {
            const res = await sharesAPI.publicPreview(token, item.id);
            setPdfPreview({ file: item, url: res.data.url });
        } catch (e) {
            console.error('Failed to load PDF:', e);
        } finally {
            setPdfLoading(false);
        }
    };

    // Handle file click
    const handleFileClick = (item) => {
        if (item.is_folder) {
            navigateInto(item);
        } else if (isPdf(item.name)) {
            openPdfFromFolder(item);
        } else if (isMd(item.name)) {
            setMdPreview({ id: item.id, name: item.name });
        }
    };

    // Navigation
    const navigateInto = (folder) => {
        setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name, children: folder.children || [] }]);
    };
    const navigateBack = () => setCurrentPath(prev => prev.slice(0, -1));
    const navigateToBreadcrumb = (index) => {
        if (index < 0) setCurrentPath([]);
        else setCurrentPath(prev => prev.slice(0, index + 1));
    };

    const currentItems = currentPath.length > 0
        ? currentPath[currentPath.length - 1].children || []
        : folderContents || [];

    // ─── Shared sub-components ───
    const ThemeToggle = () => (
        <button onClick={() => setDarkMode(v => !v)} className="sf-icon-btn" title={darkMode ? 'Light Mode' : 'Dark Mode'}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );

    const ViewToggle = () => (
        <div className="sf-view-toggle">
            <button onClick={() => setViewMode('grid')} className={`sf-vt-btn ${viewMode === 'grid' ? 'sf-vt-active' : ''}`} title="Grid View">
                <LayoutGrid size={15} />
            </button>
            <button onClick={() => setViewMode('list')} className={`sf-vt-btn ${viewMode === 'list' ? 'sf-vt-active' : ''}`} title="List View">
                <List size={15} />
            </button>
        </div>
    );

    // ─── States ───
    if (loading) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader className="scale-75" />
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <Lock className="w-12 h-12 mx-auto text-[var(--text-tertiary)]" />
                        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Access Denied</h2>
                        <p className="text-[var(--text-secondary)] text-sm">{error}</p>
                    </div>
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── PDF Viewer ───
    if (pdfPreview) {
        const isFromFolder = fileInfo?.is_folder;
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="h-screen w-screen flex flex-col">
                    <PdfViewer
                        file={pdfPreview.file}
                        fileUrl={pdfPreview.url}
                        onClose={() => setPdfPreview(null)}
                        hideDownload={!canDownload}
                    />
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── Markdown Viewer from folder ───
    if (mdPreview) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <FolderMarkdownViewer
                    token={token}
                    fileId={mdPreview.id}
                    fileName={mdPreview.name}
                    onClose={() => setMdPreview(null)}
                    darkMode={darkMode}
                />
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── OnlyOffice Editor ───
    if (editorConfig && !fileInfo?.is_folder) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="h-screen w-screen flex flex-col">
                    <div className="sf-topbar">
                        <File className="w-4 h-4 text-[var(--accent)] mr-2" />
                        <span className="text-[13px] font-medium truncate">{fileInfo.name}</span>
                        <span className="sf-perm-badge">
                            {fileInfo.permission === 'view' ? 'View Only' : fileInfo.permission === 'download' ? 'View & Download' : 'Editing'}
                        </span>
                        {fileInfo.shared_by && (
                            <span className="ml-3 text-[11px] text-[var(--text-secondary)]">
                                Shared by <strong className="text-[var(--accent)]">{fileInfo.shared_by}</strong>
                            </span>
                        )}
                        <div className="flex-1" />
                        <ThemeToggle />
                        {canDownload && (
                            <button onClick={handleDownload} className="sf-btn-primary ml-2">
                                <Download className="w-3.5 h-3.5" /> Download
                            </button>
                        )}
                    </div>
                    <div ref={editorContainerRef} className="flex-1" />
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── Markdown Viewer (direct share) ───
    if (fileInfo && !fileInfo.is_folder && isMd(fileInfo.name)) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="sf-topbar sf-topbar-fixed">
                    <div className="flex-1" />
                    <ThemeToggle />
                </div>
                <div className="pt-12">
                    <MarkdownViewer token={token} fileInfo={fileInfo} />
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── FOLDER BROWSER ───
    if (fileInfo?.is_folder) {
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                {pdfLoading && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <div className="text-center">
                            <Loader className="scale-75 mx-auto mb-2" />
                            <span className="text-sm text-white">Loading PDF...</span>
                        </div>
                    </div>
                )}

                {/* Top bar */}
                <div className="sf-topbar">
                    <FolderArchive className="w-5 h-5 text-[var(--accent)] mr-2" />
                    <div className="mr-4">
                        <h1 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{fileInfo.name}</h1>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                            Shared by <strong className="text-[var(--accent)]">{fileInfo.shared_by}</strong>
                            &nbsp;·&nbsp;{flatCount(folderContents || [])} files&nbsp;·&nbsp;
                            <span className="sf-perm-badge-inline">
                                {fileInfo.permission === 'view' ? 'View Only' : fileInfo.permission === 'download' ? 'View & Download' : 'Full Access'}
                            </span>
                        </p>
                    </div>
                    <div className="flex-1" />
                    <ViewToggle />
                    <ThemeToggle />
                    {canDownload && (
                        <button onClick={handleDownloadZip} className="sf-btn-primary ml-3">
                            <Download className="w-4 h-4" /> Download All (.zip)
                        </button>
                    )}
                </div>

                {/* Breadcrumb */}
                <div className="sf-breadcrumb">
                    <button onClick={() => navigateToBreadcrumb(-1)} className="sf-breadcrumb-item">
                        <Folder className="w-3.5 h-3.5" /> {fileInfo.name}
                    </button>
                    {currentPath.map((p, i) => (
                        <span key={p.id} className="flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)]" />
                            <button onClick={() => navigateToBreadcrumb(i)} className="sf-breadcrumb-item">
                                {p.name}
                            </button>
                        </span>
                    ))}
                </div>

                {/* Back button */}
                {currentPath.length > 0 && (
                    <div className="px-6 pb-2 pt-2">
                        <button onClick={navigateBack} className="sf-back-btn">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                    </div>
                )}

                {/* File list / grid */}
                <div className="sf-file-list">
                    {currentItems.length === 0 ? (
                        <div className="text-center py-16 text-[var(--text-tertiary)]">
                            <Folder className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>This folder is empty</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        /* ═══ GRID VIEW ═══ */
                        <div className="sf-grid">
                            {currentItems.map(item => (
                                <div key={item.id}
                                    className="sf-grid-card"
                                    onClick={() => handleFileClick(item)}
                                    style={{ cursor: (item.is_folder || isPdf(item.name) || isMd(item.name)) ? 'pointer' : 'default' }}
                                >
                                    <div className="sf-grid-icon">
                                        {getFileIcon(item, 'w-8 h-8')}
                                    </div>
                                    <div className="sf-grid-name">{item.name}</div>
                                    <div className="sf-grid-meta">
                                        {item.is_folder ? `${flatCount(item.children || [])} items` : formatSize(item.size)}
                                    </div>
                                    {/* Action badges */}
                                    <div className="sf-grid-actions">
                                        {isPdf(item.name) && !item.is_folder && (
                                            <span className="sf-preview-badge"><Eye className="w-3 h-3" /> View</span>
                                        )}
                                        {isMd(item.name) && !item.is_folder && (
                                            <span className="sf-preview-badge"><Eye className="w-3 h-3" /> View</span>
                                        )}
                                        {!item.is_folder && canDownload && (
                                            <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(item.id); }}
                                                className="sf-dl-btn-sm" title="Download">
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* ═══ LIST VIEW ═══ */
                        <div className="sf-table">
                            <div className="sf-table-header">
                                <span className="sf-col-name">Name</span>
                                <span className="sf-col-size">Size</span>
                                <span className="sf-col-action"></span>
                            </div>
                            {currentItems.map(item => (
                                <div key={item.id}
                                    className="sf-table-row"
                                    onClick={() => handleFileClick(item)}
                                    style={{ cursor: (item.is_folder || isPdf(item.name) || isMd(item.name)) ? 'pointer' : 'default' }}
                                >
                                    <div className="sf-col-name">
                                        {getFileIcon(item)}
                                        <span className="truncate ml-2">{item.name}</span>
                                        {item.is_folder && <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] ml-auto" />}
                                        {(isPdf(item.name) || isMd(item.name)) && !item.is_folder && (
                                            <span className="sf-preview-badge ml-auto">
                                                <Eye className="w-3 h-3" /> View
                                            </span>
                                        )}
                                    </div>
                                    <div className="sf-col-size text-[var(--text-secondary)]">
                                        {item.is_folder ? `${flatCount(item.children || [])} items` : formatSize(item.size)}
                                    </div>
                                    <div className="sf-col-action">
                                        {!item.is_folder && canDownload && (
                                            <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(item.id); }}
                                                className="sf-dl-btn" title="Download">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── Single File Card ───
    return (
        <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
            <div className="sf-topbar sf-topbar-fixed">
                <div className="flex-1" />
                <ThemeToggle />
            </div>
            <div className="min-h-screen flex items-center justify-center">
                <div className="sf-card">
                    <File className="w-16 h-16 mx-auto text-[var(--accent)] mb-4" />
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{fileInfo.name}</h2>
                    <p className="text-[13px] text-[var(--text-tertiary)] mb-1">
                        {formatSize(fileInfo.size)} • Shared file
                    </p>
                    {fileInfo.shared_by && (
                        <p className="text-[13px] text-[var(--text-secondary)] mb-5">
                            Shared by <strong className="text-[var(--accent)]">{fileInfo.shared_by}</strong>
                        </p>
                    )}
                    {fileInfo.permission === 'view' ? (
                        <p className="text-[13px] text-[var(--text-secondary)]">
                            This file is shared as <strong>view only</strong>. Downloading is not available.
                        </p>
                    ) : (
                        <button onClick={handleDownload} className="sf-btn-primary text-sm px-6 py-2.5">
                            <Download className="w-4 h-4" /> Download File
                        </button>
                    )}
                </div>
            </div>
            <style>{sharedPageCSS}</style>
        </div>
    );
}

// ─── CSS ───
const sharedPageCSS = `
    /* ═══ Theme: matching main app colors ═══ */
    .sf-page[data-theme="dark"] {
        --bg-primary: #262626;
        --bg-secondary: #2d2d2d;
        --bg-tertiary: #343434;
        --card-bg: #2f2f32;
        --card-hover: #38383d;
        --text-primary: #f3f4f6;
        --text-secondary: #d1d5db;
        --text-tertiary: #9ca3af;
        --border-color: #3f3f46;
        --accent: #34d399;
        --accent-rgb: 52,211,153;
        --hover-bg: #38383d;
        --row-hover: rgba(52,211,153,0.06);
    }
    .sf-page[data-theme="light"] {
        --bg-primary: #ffffff;
        --bg-secondary: #f5f5f5;
        --bg-tertiary: #ebebeb;
        --card-bg: #ffffff;
        --card-hover: #f0f0f5;
        --text-primary: #1e1e2e;
        --text-secondary: #585b70;
        --text-tertiary: #7f849c;
        --border-color: #e6e6e6;
        --accent: #40a02b;
        --accent-rgb: 64,160,43;
        --hover-bg: #eceff1;
        --row-hover: rgba(64,160,43,0.06);
    }
    .sf-page {
        min-height: 100vh; background: var(--bg-primary); color: var(--text-primary);
        font-family: 'Inter', -apple-system, sans-serif;
    }

    /* ═══ Top bar ═══ */
    .sf-topbar {
        height: 52px; display: flex; align-items: center; padding: 0 20px;
        border-bottom: 1px solid var(--border-color); background: var(--card-bg);
        position: sticky; top: 0; z-index: 10; gap: 6px;
    }
    .sf-topbar-fixed { position: fixed; top: 0; left: 0; right: 0; }

    /* ═══ Icon buttons ═══ */
    .sf-icon-btn {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        border-radius: 10px; border: 1px solid var(--border-color);
        background: var(--bg-secondary); color: var(--text-secondary);
        cursor: pointer; transition: all 0.2s;
    }
    .sf-icon-btn:hover { background: var(--hover-bg); color: var(--text-primary); }

    /* ═══ View toggle ═══ */
    .sf-view-toggle {
        display: flex; border-radius: 10px; border: 1px solid var(--border-color);
        overflow: hidden; margin-right: 4px;
    }
    .sf-vt-btn {
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        background: var(--bg-secondary); color: var(--text-tertiary);
        border: none; cursor: pointer; transition: all 0.15s;
    }
    .sf-vt-btn:hover { color: var(--text-primary); }
    .sf-vt-active { background: var(--accent) !important; color: #fff !important; }

    /* ═══ Buttons ═══ */
    .sf-btn-primary {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px; border-radius: 10px; font-size: 13px;
        font-weight: 600; background: var(--accent); color: #fff;
        border: none; cursor: pointer; transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.25);
    }
    .sf-btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }

    .sf-dl-btn {
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        border-radius: 8px; border: 1px solid var(--border-color);
        background: transparent; color: var(--text-secondary);
        cursor: pointer; transition: all 0.15s;
    }
    .sf-dl-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

    .sf-dl-btn-sm {
        width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
        border-radius: 7px; border: 1px solid var(--border-color);
        background: transparent; color: var(--text-secondary);
        cursor: pointer; transition: all 0.15s;
    }
    .sf-dl-btn-sm:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* ═══ Badges ═══ */
    .sf-perm-badge {
        margin-left: 8px; font-size: 10px; padding: 2px 8px;
        border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary);
    }
    .sf-perm-badge-inline {
        font-size: 10px; padding: 1px 6px; border-radius: 4px;
        background: rgba(var(--accent-rgb),0.12); color: var(--accent); font-weight: 600;
    }
    .sf-preview-badge {
        display: inline-flex; align-items: center; gap: 3px;
        font-size: 10px; padding: 2px 8px; border-radius: 6px;
        background: rgba(var(--accent-rgb),0.1); color: var(--accent);
        font-weight: 600; white-space: nowrap;
    }

    /* ═══ Breadcrumb ═══ */
    .sf-breadcrumb {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 20px; border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary); font-size: 13px;
    }
    .sf-breadcrumb-item {
        display: flex; align-items: center; gap: 4px; padding: 2px 8px;
        border-radius: 6px; background: transparent; border: none;
        color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s;
    }
    .sf-breadcrumb-item:hover { background: var(--hover-bg); color: var(--text-primary); }
    .sf-breadcrumb-item:last-child { color: var(--text-primary); font-weight: 600; }

    /* ═══ Back button ═══ */
    .sf-back-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 12px; border-radius: 8px; font-size: 12px;
        border: 1px solid var(--border-color); background: transparent;
        color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .sf-back-btn:hover { background: var(--hover-bg); color: var(--text-primary); }

    /* ═══ File list container ═══ */
    .sf-file-list { padding: 16px 20px; }

    /* ═══ Grid View ═══ */
    .sf-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
    }
    .sf-grid-card {
        display: flex; flex-direction: column; align-items: center;
        padding: 20px 12px 14px; border-radius: 12px;
        border: 1px solid var(--border-color); background: var(--card-bg);
        transition: all 0.2s; position: relative;
    }
    .sf-grid-card:hover { background: var(--card-hover); border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .sf-grid-icon { margin-bottom: 10px; }
    .sf-grid-name {
        font-size: 12px; font-weight: 600; text-align: center;
        color: var(--text-primary); word-break: break-word;
        line-height: 1.3; margin-bottom: 4px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .sf-grid-meta { font-size: 10px; color: var(--text-tertiary); margin-bottom: 6px; }
    .sf-grid-actions { display: flex; align-items: center; gap: 4px; margin-top: auto; }

    /* ═══ List View (Table) ═══ */
    .sf-table { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
    .sf-table-header {
        display: grid; grid-template-columns: 1fr 120px 60px;
        padding: 10px 16px; background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--text-tertiary);
    }
    .sf-table-row {
        display: grid; grid-template-columns: 1fr 120px 60px;
        padding: 10px 16px; align-items: center;
        border-bottom: 1px solid var(--border-color); transition: background 0.15s;
    }
    .sf-table-row:last-child { border-bottom: none; }
    .sf-table-row:hover { background: var(--row-hover); }
    .sf-col-name { display: flex; align-items: center; min-width: 0; font-size: 13px; font-weight: 500; }
    .sf-col-size { font-size: 12px; }
    .sf-col-action { display: flex; justify-content: flex-end; }

    /* ═══ Card ═══ */
    .sf-card {
        width: 400px; padding: 32px; text-align: center;
        border-radius: 16px; border: 1px solid var(--border-color);
        background: var(--card-bg); box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    }

    /* ═══ Responsive ═══ */
    @media (max-width: 640px) {
        .sf-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
        .sf-grid-card { padding: 14px 8px 10px; }
        .sf-table-header, .sf-table-row { grid-template-columns: 1fr 80px 50px; }
        .sf-topbar { padding: 0 12px; }
        .sf-file-list { padding: 10px 12px; }
        .sf-card { width: 90vw; }
    }
`;
