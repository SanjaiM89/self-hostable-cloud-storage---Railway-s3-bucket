import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
    Download, File, Lock, Folder, ChevronRight,
    Sun, Moon, FileText, Image, Film, Music,
    Archive, Code, Table, Database, FolderArchive,
    ArrowLeft, ExternalLink, Eye,
} from 'lucide-react';
import { sharesAPI } from '../utils/api';
import MarkdownViewer from '../components/MarkdownViewer';
import PdfViewer from '../components/PdfViewer';
import Loader from '../components/Loader';

// ─── File icon helper ───
function getFileIcon(file) {
    if (file.is_folder) return <Folder className="w-5 h-5 text-[var(--accent)]" />;
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    const mime = file.mime_type || '';
    if (mime.startsWith('image/') || /^(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/.test(ext))
        return <Image className="w-5 h-5 text-pink-400" />;
    if (mime.startsWith('video/') || /^(mp4|webm|mov|avi|mkv)$/.test(ext))
        return <Film className="w-5 h-5 text-purple-400" />;
    if (mime.startsWith('audio/') || /^(mp3|wav|ogg|m4a|flac|aac)$/.test(ext))
        return <Music className="w-5 h-5 text-cyan-400" />;
    if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext))
        return <Archive className="w-5 h-5 text-amber-400" />;
    if (/^(js|ts|jsx|tsx|py|java|c|cpp|rs|go|rb|php|html|css|json|xml|yaml|yml|sh|sql)$/.test(ext))
        return <Code className="w-5 h-5 text-green-400" />;
    if (/^(xlsx?|csv|ods)$/.test(ext))
        return <Table className="w-5 h-5 text-emerald-400" />;
    if (/^(db|sqlite|sql)$/.test(ext))
        return <Database className="w-5 h-5 text-orange-400" />;
    if (/^(md|txt|rtf|doc|docx|pdf|odt)$/.test(ext))
        return <FileText className="w-5 h-5 text-blue-400" />;
    return <File className="w-5 h-5 text-[var(--text-tertiary)]" />;
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

function isPdf(name) {
    return name?.toLowerCase().endsWith('.pdf');
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
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    // PDF preview state (for folder files or direct shares)
    const [pdfPreview, setPdfPreview] = useState(null); // { file, url }
    const [pdfLoading, setPdfLoading] = useState(false);

    // PDFs handled separately now
    const editableExts = /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv|txt|rtf)$/i;
    const canDownload = fileInfo && fileInfo.permission !== 'view';

    // Persist dark mode
    useEffect(() => {
        localStorage.setItem('shared_dark_mode', darkMode ? 'true' : 'false');
        document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    }, [darkMode]);

    // Load file info & folder contents
    useEffect(() => {
        loadFile();
    }, [token]);

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
                // Directly shared PDF → load presigned URL for PDF viewer
                try {
                    const previewRes = await sharesAPI.publicPreview(token, res.data.file_id);
                    setPdfPreview({ file: res.data, url: previewRes.data.url });
                } catch (e) {
                    console.error('Failed to load PDF preview:', e);
                }
            } else if (editableExts.test(res.data.name)) {
                // OnlyOffice-compatible
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

    // Download single shared file
    const handleDownload = async () => {
        try {
            const res = await sharesAPI.publicDownload(token);
            window.open(res.data.url, '_blank');
        } catch (e) {
            setError(e.response?.data?.detail || 'Download not allowed');
        }
    };

    // Download individual file from folder
    const handleDownloadFile = (fileId) => {
        const url = sharesAPI.publicDownloadFile(token, fileId);
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Download folder as ZIP
    const handleDownloadZip = () => {
        const url = sharesAPI.publicDownloadZip(token);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileInfo?.name || 'folder'}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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

    // Handle file click in folder browser
    const handleFileClick = (item) => {
        if (item.is_folder) {
            navigateInto(item);
        } else if (isPdf(item.name)) {
            openPdfFromFolder(item);
        }
    };

    // Navigate into subfolder
    const navigateInto = (folder) => {
        setCurrentPath(prev => [...prev, { id: folder.id, name: folder.name, children: folder.children || [] }]);
    };

    const navigateBack = () => setCurrentPath(prev => prev.slice(0, -1));

    const navigateToBreadcrumb = (index) => {
        if (index < 0) setCurrentPath([]);
        else setCurrentPath(prev => prev.slice(0, index + 1));
    };

    // Get current items to display
    const currentItems = currentPath.length > 0
        ? currentPath[currentPath.length - 1].children || []
        : folderContents || [];

    // ─── Theme toggle button ───
    const ThemeToggle = () => (
        <button onClick={() => setDarkMode(v => !v)} className="sf-theme-toggle" title={darkMode ? 'Switch to Light' : 'Switch to Dark'}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );

    // ─── Loading State ───
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

    // ─── Error State ───
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

    // ─── PDF Viewer (direct share OR folder file) ───
    if (pdfPreview) {
        // If viewing from a folder, the PdfViewer's close goes back to folder.
        // If direct PDF share, close shows the file card fallback.
        const isFromFolder = fileInfo?.is_folder;
        return (
            <div className="sf-page" data-theme={darkMode ? 'dark' : 'light'}>
                <div className="h-screen w-screen flex flex-col">
                    <PdfViewer
                        file={pdfPreview.file}
                        fileUrl={pdfPreview.url}
                        onClose={() => {
                            if (isFromFolder) {
                                setPdfPreview(null);
                            } else {
                                // Direct PDF share — just reset to show the card
                                setPdfPreview(null);
                            }
                        }}
                        hideDownload={!canDownload}
                    />
                </div>
                <style>{sharedPageCSS}</style>
            </div>
        );
    }

    // ─── Directly shared PDF — auto-open in viewer (already handled above via pdfPreview state) ───
    // If PDF preview failed to load, fall through to the file card below.

    // ─── OnlyOffice Editor (for docs/spreadsheets, NOT pdfs) ───
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

    // ─── Markdown Viewer ───
    if (fileInfo && !fileInfo.is_folder && fileInfo.name.endsWith('.md')) {
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
                {/* PDF loading overlay */}
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
                            &nbsp;·&nbsp;
                            {flatCount(folderContents || [])} files
                            &nbsp;·&nbsp;
                            <span className="sf-perm-badge-inline">
                                {fileInfo.permission === 'view' ? 'View Only' : fileInfo.permission === 'download' ? 'View & Download' : 'Full Access'}
                            </span>
                        </p>
                    </div>
                    <div className="flex-1" />
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

                {/* Back button for subfolders */}
                {currentPath.length > 0 && (
                    <div className="px-6 pb-2">
                        <button onClick={navigateBack} className="sf-back-btn">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                    </div>
                )}

                {/* File list */}
                <div className="sf-file-list">
                    {currentItems.length === 0 ? (
                        <div className="text-center py-16 text-[var(--text-tertiary)]">
                            <Folder className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>This folder is empty</p>
                        </div>
                    ) : (
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
                                    style={{ cursor: (item.is_folder || isPdf(item.name)) ? 'pointer' : 'default' }}
                                >
                                    <div className="sf-col-name">
                                        {getFileIcon(item)}
                                        <span className="truncate ml-2">{item.name}</span>
                                        {item.is_folder && <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] ml-auto" />}
                                        {isPdf(item.name) && !item.is_folder && (
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

    // ─── Single File Card (non-editable, non-PDF) ───
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
    /* Theme variables */
    .sf-page[data-theme="dark"] {
        --bg-primary: #0f0f14;
        --bg-secondary: #16161d;
        --card-bg: #1c1c27;
        --text-primary: #e4e4ed;
        --text-secondary: #9191a8;
        --text-tertiary: #5c5c73;
        --border-color: rgba(255,255,255,0.08);
        --accent: #34d399;
        --accent-rgb: 52,211,153;
        --hover-bg: rgba(255,255,255,0.04);
        --row-hover: rgba(52,211,153,0.06);
    }
    .sf-page[data-theme="light"] {
        --bg-primary: #f8f9fc;
        --bg-secondary: #ffffff;
        --card-bg: #ffffff;
        --text-primary: #1a1a2e;
        --text-secondary: #6b7280;
        --text-tertiary: #9ca3af;
        --border-color: rgba(0,0,0,0.08);
        --accent: #40a02b;
        --accent-rgb: 64,160,43;
        --hover-bg: rgba(0,0,0,0.03);
        --row-hover: rgba(64,160,43,0.06);
    }
    .sf-page {
        min-height: 100vh; background: var(--bg-primary); color: var(--text-primary);
        font-family: 'Inter', -apple-system, sans-serif;
    }

    /* Top bar */
    .sf-topbar {
        height: 52px; display: flex; align-items: center; padding: 0 20px;
        border-bottom: 1px solid var(--border-color); background: var(--card-bg);
        position: sticky; top: 0; z-index: 10;
    }
    .sf-topbar-fixed { position: fixed; top: 0; left: 0; right: 0; }

    /* Theme toggle */
    .sf-theme-toggle {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        border-radius: 10px; border: 1px solid var(--border-color);
        background: var(--bg-secondary); color: var(--text-secondary);
        cursor: pointer; transition: all 0.2s;
    }
    .sf-theme-toggle:hover { background: var(--hover-bg); color: var(--text-primary); }

    /* Buttons */
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

    /* Permission badges */
    .sf-perm-badge {
        margin-left: 8px; font-size: 10px; padding: 2px 8px;
        border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary);
    }
    .sf-perm-badge-inline {
        font-size: 10px; padding: 1px 6px; border-radius: 4px;
        background: rgba(var(--accent-rgb),0.12); color: var(--accent);
        font-weight: 600;
    }

    /* Preview badge on PDF rows */
    .sf-preview-badge {
        display: inline-flex; align-items: center; gap: 3px;
        font-size: 10px; padding: 2px 8px; border-radius: 6px;
        background: rgba(var(--accent-rgb),0.1); color: var(--accent);
        font-weight: 600; white-space: nowrap;
    }

    /* Breadcrumb */
    .sf-breadcrumb {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 20px; border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary); font-size: 13px;
    }
    .sf-breadcrumb-item {
        display: flex; align-items: center; gap: 4px; padding: 2px 8px;
        border-radius: 6px; background: transparent; border: none;
        color: var(--text-secondary); cursor: pointer; font-size: 13px;
        transition: all 0.15s;
    }
    .sf-breadcrumb-item:hover { background: var(--hover-bg); color: var(--text-primary); }
    .sf-breadcrumb-item:last-child { color: var(--text-primary); font-weight: 600; }

    /* Back button */
    .sf-back-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 12px; border-radius: 8px; font-size: 12px;
        border: 1px solid var(--border-color); background: transparent;
        color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
    }
    .sf-back-btn:hover { background: var(--hover-bg); color: var(--text-primary); }

    /* File table */
    .sf-file-list { padding: 12px 20px; }
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
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s;
    }
    .sf-table-row:last-child { border-bottom: none; }
    .sf-table-row:hover { background: var(--row-hover); }
    .sf-col-name { display: flex; align-items: center; min-width: 0; font-size: 13px; font-weight: 500; }
    .sf-col-size { font-size: 12px; }
    .sf-col-action { display: flex; justify-content: flex-end; }

    /* Card */
    .sf-card {
        width: 400px; padding: 32px; text-align: center;
        border-radius: 16px; border: 1px solid var(--border-color);
        background: var(--card-bg); box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    }

    /* Responsive */
    @media (max-width: 640px) {
        .sf-table-header, .sf-table-row { grid-template-columns: 1fr 80px 50px; }
        .sf-topbar { padding: 0 12px; }
        .sf-file-list { padding: 8px 12px; }
        .sf-card { width: 90vw; }
    }
`;
