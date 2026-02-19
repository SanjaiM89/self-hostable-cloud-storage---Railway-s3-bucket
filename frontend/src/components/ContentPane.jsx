import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue, forwardRef, useImperativeHandle } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from './Navbar';
import FileGrid from './FileGrid';
import MarkdownEditor from './MarkdownEditor';
import PdfViewer from './PdfViewer';
import Loader from './Loader';
import SearchModal from './SearchModal';
import InputModal from './InputModal';
import ShareModal from './ShareModal';
import SelectionBar from './SelectionBar';
import MediaViewerModal from './MediaViewerModal';
import { useMobile, MobileActionSheet, MobileMediaViewer } from '../mobile';
import { filesAPI } from '../utils/api';
import { uploadFolder, scanEntries, uploadScannedEntries } from '../utils/folderUpload';

function normalizeListResponse(payload) {
    if (Array.isArray(payload)) {
        return { items: payload, hasMore: false };
    }
    if (payload && Array.isArray(payload.items)) {
        return { items: payload.items, hasMore: Boolean(payload.has_more) };
    }
    return { items: [], hasMore: false };
}

const ContentPane = forwardRef(function ContentPane({
    paneId,
    isActive,
    onFocus,
    onSplit,
    onClose,
    initialFolder = null,
    initialScope = 'files',
    initialFile = null, // New prop
    className = '',
    // Shared props / callbacks that might be global
    addActivity,
    updateActivity,
    clipboard,
    onPaste,
    onCopyItems, // New prop for batch copy
    onCutItems, // New prop for batch cut
    onCancelPaste, // New prop for cancelling paste
    // We might need to bubble up navigation to update URL if active
    onNavigate,
    wsSubscribe // Connection from parent
}, ref) {
    // ─── Local State ───
    const [files, setFiles] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(initialFolder);
    const [viewScope, setViewScope] = useState(initialScope); // 'files' or 'trash'
    const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'Home' }]);

    // UI State
    const [viewMode, setViewMode] = useState('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    // File Viewers / Editors
    const [markdownFile, setMarkdownFile] = useState(null);
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [mediaFile, setMediaFile] = useState(null); // Managed locally here

    const [editingFile, setEditingFile] = useState(null);
    const [editorConfig, setEditorConfig] = useState(null);
    const [saveStatus, setSaveStatus] = useState('saved');
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    // Modals
    const [inputModal, setInputModal] = useState(null);
    const [shareFile, setShareFile] = useState(null);
    const [mobileActionFile, setMobileActionFile] = useState(null);

    const fileInputRef = useRef(null);
    const isMobile = useMobile();

    const selectedFiles = useMemo(() => files.filter(f => selectedIds.includes(f.id)), [files, selectedIds]);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // ─── Initialization ───
    useEffect(() => {
        if (initialScope === 'trash') {
            setBreadcrumbs([{ id: 'trash', name: 'Trash' }]);
            setViewScope('trash');
            setCurrentFolder(null); // Trash is root-less usually
        } else {
            setViewScope('files');
            setCurrentFolder(initialFolder);
            if (initialFolder === null) {
                setBreadcrumbs([{ id: null, name: 'Home' }]);
            }
        }
    }, [initialFolder, initialScope]);

    // ─── File Fetching ───
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        const cacheKey = `files_cache_${paneId}_${currentFolder || 'root'}_${viewScope}`;

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                setFiles(JSON.parse(cached));
                setHasLoadedOnce(true);
            }
        } catch (e) { }

        try {
            const pageSize = 50;
            const res = viewScope === 'trash'
                ? await filesAPI.trashPaginated(pageSize, 0)
                : await filesAPI.listPaginated(currentFolder, pageSize, 0); // Pagination simplified

            const { items, hasMore } = normalizeListResponse(res.data);
            let allItems = items;

            if (hasMore) {
                // Initial simplified fetch-all logic from Dashboard
                const res2 = viewScope === 'trash'
                    ? await filesAPI.trashPaginated(pageSize, pageSize)
                    : await filesAPI.listPaginated(currentFolder, pageSize, pageSize);
                const batch2 = normalizeListResponse(res2.data);
                allItems = [...allItems, ...batch2.items];
            }

            setFiles(allItems);
            setHasLoadedOnce(true);
            localStorage.setItem(cacheKey, JSON.stringify(allItems));
        } catch (err) {
            console.error('Fetch failed', err);
            setHasLoadedOnce(true);
        } finally {
            setLoading(false);
        }
    }, [currentFolder, viewScope, paneId]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    // ─── Initial File Handling (Split Screen) ───
    useEffect(() => {
        if (initialFile) {
            handleOpenFile(initialFile);
        }
    }, []); // Run once on mount

    // ─── WebSocket ───
    useEffect(() => {
        if (!wsSubscribe) return;
        const unsubscribe = wsSubscribe((msg) => {
            if (msg.type === 'refresh') {
                const isRelevant = (msg.folder_id == currentFolder) || (!currentFolder && !msg.folder_id);
                if (isRelevant) fetchFiles();
            } else if (msg.type === 'refresh_trash' && viewScope === 'trash') {
                fetchFiles();
            }
        });
        return () => unsubscribe();
    }, [wsSubscribe, fetchFiles, currentFolder, viewScope]);

    // ─── Navigation ───
    const handleNavigate = (folderId, folderName) => {
        if (editingFile) closeEditor();
        setViewScope('files');
        setCurrentFolder(folderId);

        if (folderId === null) {
            setBreadcrumbs([{ id: null, name: 'Home' }]);
        } else {
            setBreadcrumbs(prev => {
                const idx = prev.findIndex(b => b.id === folderId);
                if (idx > -1) return prev.slice(0, idx + 1);
                return [...prev, { id: folderId, name: folderName || 'Folder' }];
            });
        }

        // Notify parent to update URL if this is the active pane
        if (onNavigate) onNavigate(folderId);
    };

    // ─── Single Item Operations ───
    const handleUpload = async (fileList) => {
        for (const file of fileList) {
            const aid = addActivity('upload', file.name);
            const formData = new FormData();
            formData.append('file', file);
            if (currentFolder) formData.append('parent_id', currentFolder);
            try {
                await filesAPI.upload(formData, (pe) => {
                    updateActivity(aid, { percent: Math.round((pe.loaded * 100) / pe.total) });
                });
                updateActivity(aid, { status: 'done', percent: 100 });
            } catch (err) {
                console.error('Upload failed', err);
                updateActivity(aid, { status: 'error' });
            }
        }
        fetchFiles();
    };

    const handleFolderUpload = async (fileList) => {
        const aid = addActivity('upload', `Folder upload...`);
        try {
            await uploadFolder(fileList, currentFolder, (current, total, status) => {
                updateActivity(aid, { percent: Math.round((current / total) * 100), name: status });
            });
            updateActivity(aid, { status: 'done', percent: 100, name: 'Folder upload complete' });
            fetchFiles();
        } catch (err) {
            console.error('Folder upload failed', err);
            updateActivity(aid, { status: 'error', name: 'Folder upload failed' });
        }
    };

    const handleCreateFolder = async (name) => {
        try {
            await filesAPI.createFolder(name, currentFolder);
            fetchFiles();
        } catch (err) { console.error(err); }
    };

    const handleCreateDocument = async (name, docType) => {
        const aid = addActivity('upload', `${name} (creating...)`);
        try {
            const res = await filesAPI.createDocument(name, docType, currentFolder);
            updateActivity(aid, { status: 'done', name: res.data.name });
            fetchFiles();
            if (docType === 'markdown') {
                setMarkdownFile(res.data);
                setBreadcrumbs(prev => [...prev, { id: `md-${res.data.id}`, name: res.data.name }]);
            } else {
                openEditor(res.data);
            }
        } catch (err) {
            console.error(err);
            updateActivity(aid, { status: 'error' });
        }
    };

    const handleRename = async (file) => {
        const newName = window.prompt('Enter new name:', file.name);
        if (newName && newName !== file.name) {
            try {
                await filesAPI.rename(file.id, newName);
                fetchFiles();
            } catch (err) { console.error(err); }
        }
    };

    const handleDelete = async (file) => {
        if (window.confirm(`Delete "${file.name}"?`)) {
            try {
                if (viewScope === 'trash') await filesAPI.emptyTrash();
                else await filesAPI.delete(file.id);
                fetchFiles();
            } catch (err) { console.error(err); }
        }
    };

    const handleDownload = async (file) => {
        const aid = addActivity('download', file.name);
        try {
            const res = await filesAPI.download(file.id);
            window.open(res.data.url, '_blank');
            updateActivity(aid, { status: 'done' });
        } catch (err) {
            updateActivity(aid, { status: 'error' });
        }
    };

    const handleExtract = async (file) => {
        const aid = addActivity('extract', file.name);
        try {
            const res = await filesAPI.extractZip(file.id);
            updateActivity(aid, { status: 'done', name: `${file.name} -> ${res.data.extracted_count} files` });
            fetchFiles();
        } catch (err) {
            updateActivity(aid, { status: 'error' });
        }
    };

    // ─── Batch Operations ───
    const handleBatchDelete = async () => {
        if (!window.confirm(`Delete ${selectedFiles.length} items?`)) return;
        try {
            await filesAPI.batchDelete(selectedIds);
            setSelectedIds([]);
            fetchFiles();
        } catch (err) { alert('Failed to delete items'); }
    };

    const handleNewFolderWithSelection = () => {
        setInputModal({
            title: 'Group Selection',
            placeholder: 'Enter folder name...',
            onConfirm: async (name) => {
                setInputModal(null);
                if (!name) return;
                const aid = addActivity('group', `Grouping ${selectedIds.length} items`);
                try {
                    const res = await filesAPI.createFolder(name, currentFolder);
                    await filesAPI.batchMove(selectedIds, res.data.id);
                    updateActivity(aid, { status: 'done', percent: 100 });
                    setSelectedIds([]);
                    fetchFiles();
                } catch (err) {
                    updateActivity(aid, { status: 'error' });
                }
            }
        });
    };

    // ─── Imperative Actions (for Sidebar) ───
    const promptCreateFolder = () => {
        setInputModal({
            title: 'New Folder',
            placeholder: 'Folder name...',
            onConfirm: async (name) => {
                setInputModal(null);
                if (name) handleCreateFolder(name);
            }
        });
    };

    // Hidden Input for Imperative Upload
    const hiddenInputRef = useRef(null);
    const triggerUpload = () => hiddenInputRef.current?.click();

    const promptCreateDocument = () => {
        setInputModal({
            title: 'New Document',
            placeholder: 'Document name (e.g. notes.md)',
            onConfirm: async (name) => {
                setInputModal(null);
                if (name) handleCreateDocument(name, 'markdown');
            }
        });
    };

    const openSearch = () => setSearchOpen(true);

    useImperativeHandle(ref, () => ({
        promptCreateFolder,
        triggerUpload,
        promptCreateDocument,
        openSearch
    }));

    // ─── Editors ───
    const openEditor = async (file) => {
        try {
            const res = await filesAPI.editorConfig(file.id);
            setEditingFile(file);
            setEditorConfig(res.data);
            setBreadcrumbs(p => [...p, { id: `editor-${file.id}`, name: file.name }]);
        } catch (err) { console.error(err); }
    };

    const closeEditor = async () => {
        if (editorInstanceRef.current) {
            try { editorInstanceRef.current.triggerForceSave && editorInstanceRef.current.triggerForceSave(); } catch (e) { }
            await new Promise(r => setTimeout(r, 1500));
            try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
            editorInstanceRef.current = null;
        }
        setSaveStatus('saved');
        setEditingFile(null);
        setEditorConfig(null);
        setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('editor-')));
        fetchFiles();
    };

    useEffect(() => {
        if (!editorConfig || !editorContainerRef.current) return;
        const container = editorContainerRef.current;
        container.innerHTML = '';
        const div = document.createElement('div');
        div.id = `onlyoffice-editor-${paneId}`; // Unique ID per pane
        div.style.height = '100%';
        div.style.width = '100%';
        container.appendChild(div);

        const init = () => {
            if (editorInstanceRef.current) try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
            const configWithEvents = {
                ...editorConfig,
                events: {
                    ...editorConfig.events,
                    onDocumentStateChange: (e) => setSaveStatus(e.data ? 'unsaved' : 'saved'),
                }
            };
            editorInstanceRef.current = new window.DocsAPI.DocEditor(div.id, configWithEvents);
        };

        if (window.DocsAPI) init();
        else {
            // Load script if not loaded (Dashboard might have loaded it, but checking is safe)
            const script = document.createElement('script');
            script.src = `${import.meta.env.VITE_ONLYOFFICE_URL || 'http://localhost:8080'}/web-apps/apps/api/documents/api.js`;
            script.onload = init;
            document.head.appendChild(script);
        }
        return () => {
            if (editorInstanceRef.current) {
                try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
                editorInstanceRef.current = null;
            }
            container.innerHTML = '';
        };
    }, [editorConfig, paneId]);

    // ─── Open File ───
    const handleOpenFile = (file) => {
        if (file.is_folder) {
            handleNavigate(file.id, file.name);
            return;
        }
        const ext = file.name.split('.').pop().toLowerCase();

        if (file.name.endsWith('.md')) {
            setMarkdownFile(file);
            setBreadcrumbs(p => [...p, { id: `md-${file.id}`, name: file.name }]);
            return;
        }

        const isMedia = file.mime_type?.startsWith('video/') || file.mime_type?.startsWith('audio/') || file.mime_type?.startsWith('image/');
        if (isMedia) {
            setMediaFile(file);
            return;
        }

        if (ext === 'pdf') {
            (async () => {
                const res = await filesAPI.download(file.id);
                setPdfFile(file);
                setPdfUrl(res.data.url);
                setBreadcrumbs(p => [...p, { id: `pdf-${file.id}`, name: file.name }]);
            })();
            return;
        }

        if (['docx', 'xlsx', 'pptx', 'txt'].includes(ext)) {
            openEditor(file);
            return;
        }

        handleDownload(file);
    };

    // ─── Sorted Files ───
    const sortedFiles = useMemo(() => {
        const q = deferredSearchQuery.trim().toLowerCase();
        const f = q ? files.filter(file => file.name.toLowerCase().includes(q)) : files;
        return [...f].sort((a, b) => {
            if (a.is_folder && !b.is_folder) return -1;
            if (!a.is_folder && b.is_folder) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }, [files, deferredSearchQuery]);

    // ─── Drag & Drop ───
    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const items = e.dataTransfer.items;
        if (items && items.length > 0) {
            const aid = addActivity('upload', 'Scanning dropped files...');
            try {
                const scanned = await scanEntries(items);
                if (scanned.length === 0) return;
                updateActivity(aid, { name: `Uploading ${scanned.length} items...` });
                await uploadScannedEntries(scanned, currentFolder, (cur, tot, st) => {
                    updateActivity(aid, { percent: Math.round((cur / tot) * 100), name: st });
                });
                updateActivity(aid, { status: 'done', percent: 100 });
                fetchFiles();
            } catch (err) {
                console.error(err);
                updateActivity(aid, { status: 'error' });
            }
        }
    };

    // Wrapper for Paste to include currentFolder
    const handlePaste = () => {
        if (onPaste) onPaste(currentFolder);
    };

    return (
        <div
            className={`flex-1 flex flex-col min-w-0 overflow-hidden relative border-r last:border-r-0 border-[var(--border-color)] ${className}`}
            onClick={onFocus}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget.contains(e.relatedTarget)) return; setIsDragging(false); }}
            onDrop={handleDrop}
        >
            {/* Hidden Input for Imperative Upload */}
            <input
                type="file"
                multiple
                ref={hiddenInputRef}
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.length) handleUpload(Array.from(e.target.files));
                    e.target.value = '';
                }}
            />

            {isDragging && (
                <div className="absolute inset-0 bg-blue-500/10 z-50 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                    <div className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold shadow-xl">Drop to upload</div>
                </div>
            )}

            <Navbar
                breadcrumbs={breadcrumbs}
                onBreadcrumbClick={(id) => {
                    if (String(id).startsWith('editor-')) return;
                    if (editingFile) closeEditor();
                    if (markdownFile) { setMarkdownFile(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('md-'))); }
                    if (pdfFile) { setPdfFile(null); setPdfUrl(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('pdf-'))); }
                    handleNavigate(id, breadcrumbs.find(b => b.id === id)?.name);
                }}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onUpload={handleUpload}
                onUploadFolder={handleFolderUpload}
                // showBackButton... etc
                onBack={() => {
                    if (markdownFile) { setMarkdownFile(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('md-'))); fetchFiles(); }
                    else if (pdfFile) { setPdfFile(null); setPdfUrl(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('pdf-'))); fetchFiles(); }
                    else closeEditor();
                }}
                showBackButton={!!editingFile || !!markdownFile || !!pdfFile}
                onOpenSearch={() => setSearchOpen(true)}
            />

            <div className="flex-1 overflow-y-auto relative">
                <div ref={editorContainerRef} className="h-full w-full" style={{ display: editingFile ? 'block' : 'none' }} />

                {markdownFile && <div className="h-full w-full"><MarkdownEditor file={markdownFile} onClose={() => { setMarkdownFile(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('md-'))); fetchFiles(); }} /></div>}
                {pdfFile && pdfUrl && <div className="h-full w-full"><PdfViewer file={pdfFile} fileUrl={pdfUrl} onClose={() => { setPdfFile(null); setPdfUrl(null); setBreadcrumbs(p => p.filter(b => !String(b.id).startsWith('pdf-'))); fetchFiles(); }} /></div>}

                {/* File Grid */}
                <div className="px-4 py-4 h-full" style={{ display: (editingFile || markdownFile || pdfFile) ? 'none' : 'block' }}>
                    {!hasLoadedOnce && loading ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><Loader /></div>
                    ) : (
                        <FileGrid
                            files={sortedFiles}
                            viewMode={viewMode}
                            onOpen={handleOpenFile}
                            onDownload={handleDownload}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            onCreateFolder={handleCreateFolder}
                            onUpload={handleUpload}
                            onCreateDocument={handleCreateDocument}
                            onRefresh={fetchFiles}
                            selectedIds={selectedIds}
                            onSelectionChange={setSelectedIds}
                            onShare={setShareFile}
                            onMobileAction={isMobile ? setMobileActionFile : undefined}
                            // Split Screen specific
                            onSplit={(item) => {
                                if (item.is_folder) onSplit(item.id);
                                else onSplit(currentFolder, item);
                            }}
                            onExtract={handleExtract}
                            clipboardState={clipboard}
                            onPaste={handlePaste}
                        />
                    )}
                </div>
            </div>

            {/* Modals & Overlays */}
            {inputModal && <InputModal {...inputModal} onCancel={() => setInputModal(null)} />}
            <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} currentFolder={currentFolder} onOpenResult={handleOpenFile} />
            {shareFile && <ShareModal file={shareFile} isOpen={true} onClose={() => setShareFile(null)} />}

            {/* Media Viewer */}
            {mediaFile && (isMobile ? (
                <MobileMediaViewer file={mediaFile} onClose={() => setMediaFile(null)} />
            ) : (
                <MediaViewerModal file={mediaFile} onClose={() => setMediaFile(null)} />
            ))}

            {/* Selection Bar */}
            <SelectionBar
                selectedCount={selectedIds.length}
                onClear={() => setSelectedIds([])}
                onDelete={handleBatchDelete}
                onCopy={() => onCopyItems(selectedIds)}
                onMove={() => onCutItems(selectedIds)}
                onNewFolderWithSelection={handleNewFolderWithSelection}
                clipboardState={clipboard}
                onPaste={handlePaste}
                onCancelPaste={onCancelPaste}
            />

            {/* Mobile Actions */}
            {mobileActionFile && (
                <MobileActionSheet
                    file={mobileActionFile}
                    onClose={() => setMobileActionFile(null)}
                    onDownload={handleDownload}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onShare={(f) => { setMobileActionFile(null); setShareFile(f); }}
                    onExtract={handleExtract}
                />
            )}
        </div>
    );
});

export default ContentPane;
