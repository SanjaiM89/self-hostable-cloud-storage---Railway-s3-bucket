import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import FileGrid from '../components/FileGrid';
import ActivityBar from '../components/ActivityBar';
import MarkdownEditor from '../components/MarkdownEditor';
import { filesAPI } from '../utils/api';

let activityIdCounter = 0;

import MediaViewerModal from '../components/MediaViewerModal';
import { uploadFolder } from '../utils/folderUpload';

export default function Dashboard() {
    const [files, setFiles] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'Home' }]);
    const [mediaFile, setMediaFile] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [loading, setLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const [activities, setActivities] = useState([]);

    // Inline editor state
    const [editingFile, setEditingFile] = useState(null);
    const [editorConfig, setEditorConfig] = useState(null);
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'unsaved'
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    // Markdown editor state
    const [markdownFile, setMarkdownFile] = useState(null);

    // ─── File fetching ───
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await filesAPI.list(currentFolder);
            setFiles(res.data || []);
            setHasLoadedOnce(true);
        } catch (err) {
            console.error('Failed to fetch files:', err);
            setHasLoadedOnce(true);
        } finally {
            setLoading(false);
        }
    }, [currentFolder]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    // ─── Activity helpers ───
    const addActivity = (type, name) => {
        const id = ++activityIdCounter;
        setActivities((prev) => [{ id, type, name, status: 'running', percent: 0 }, ...prev]);
        setActivityOpen(true);
        return id;
    };

    const updateActivity = (id, updates) => {
        setActivities((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } : a));
    };

    // ─── Navigation ───
    const handleNavigate = (folderId, folderName) => {
        // Close editor when navigating
        if (editingFile) closeEditor();

        setCurrentFolder(folderId);
        if (folderId === null) {
            setBreadcrumbs([{ id: null, name: 'Home' }]);
        } else {
            setBreadcrumbs((prev) => {
                const existingIndex = prev.findIndex((b) => b.id === folderId);
                if (existingIndex > -1) return prev.slice(0, existingIndex + 1);
                return [...prev, { id: folderId, name: folderName || 'Folder' }];
            });
        }
    };

    // ─── Upload ───
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
                console.error('Upload failed:', err);
                updateActivity(aid, { status: 'error' });
            }
        }
        fetchFiles();
    };

    // ─── Folder Upload ───
    const handleFolderUpload = async (fileList) => {
        const aid = addActivity('upload', `Folder upload...`);
        try {
            await uploadFolder(fileList, currentFolder, (current, total, status) => {
                updateActivity(aid, { percent: Math.round((current / total) * 100), name: status });
            });
            updateActivity(aid, { status: 'done', percent: 100, name: 'Folder upload complete' });
            fetchFiles();
        } catch (err) {
            console.error('Folder upload failed:', err);
            updateActivity(aid, { status: 'error', name: 'Folder upload failed' });
        }
    };

    // ─── Download ───
    const handleDownload = async (file) => {
        const aid = addActivity('download', file.name);
        try {
            const res = await filesAPI.download(file.id);
            window.open(res.data.url, '_blank');
            updateActivity(aid, { status: 'done' });
        } catch (err) {
            console.error('Download failed:', err);
            updateActivity(aid, { status: 'error' });
        }
    };

    // ─── Delete ───
    const handleDelete = async (file) => {
        if (window.confirm(`Delete "${file.name}"?`)) {
            try {
                await filesAPI.delete(file.id);
                fetchFiles();
            } catch (err) {
                console.error('Delete failed:', err);
            }
        }
    };

    // ─── Rename ───
    const handleRename = async (file) => {
        const newName = window.prompt('Enter new name:', file.name);
        if (newName && newName !== file.name) {
            try {
                await filesAPI.rename(file.id, newName);
                fetchFiles();
            } catch (err) {
                console.error('Rename failed:', err);
            }
        }
    };

    // ─── Create folder ───
    const handleCreateFolder = async (name) => {
        try {
            await filesAPI.createFolder(name, currentFolder);
            fetchFiles();
        } catch (err) {
            console.error('Create folder failed:', err);
        }
    };

    // ─── Create document ───
    const handleCreateDocument = async (name, docType) => {
        const aid = addActivity('upload', `${name} (creating...)`);
        try {
            const res = await filesAPI.createDocument(name, docType, currentFolder);
            updateActivity(aid, { status: 'done', name: res.data.name });
            fetchFiles();
            // Auto-open: markdown files go to MarkdownEditor, others to OnlyOffice
            if (docType === 'markdown') {
                setMarkdownFile(res.data);
                setBreadcrumbs((prev) => [...prev, { id: `md-${res.data.id}`, name: res.data.name }]);
            } else {
                openEditor(res.data);
            }
        } catch (err) {
            console.error('Create document failed:', err);
            updateActivity(aid, { status: 'error' });
        }
    };

    // ─── Extract ZIP ───
    const handleExtract = async (file) => {
        const aid = addActivity('extract', file.name);
        try {
            const res = await filesAPI.extractZip(file.id);
            updateActivity(aid, { status: 'done', name: `${file.name} → ${res.data.extracted_count} files` });
            fetchFiles();
        } catch (err) {
            console.error('Extract failed:', err);
            updateActivity(aid, { status: 'error' });
        }
    };

    // ─── OnlyOffice inline editor ───
    const openEditor = async (file) => {
        try {
            const res = await filesAPI.editorConfig(file.id);
            setEditingFile(file);
            setEditorConfig(res.data);
            // Update breadcrumbs to show the file name
            setBreadcrumbs((prev) => [...prev, { id: `editor-${file.id}`, name: file.name }]);
        } catch (err) {
            console.error('Failed to get editor config:', err);
        }
    };

    const closeEditor = async () => {
        // Force save before closing to ensure S3 is updated
        if (editorInstanceRef.current) {
            try {
                // Trigger OnlyOffice force save via command API
                editorInstanceRef.current.triggerForceSave && editorInstanceRef.current.triggerForceSave();
            } catch (e) {
                console.log('Force save attempt:', e);
            }
            // Wait briefly for the save callback to fire
            await new Promise(resolve => setTimeout(resolve, 1500));
            try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
            editorInstanceRef.current = null;
        }
        setSaveStatus('saved');
        setEditingFile(null);
        setEditorConfig(null);
        // Remove the editor breadcrumb
        setBreadcrumbs((prev) => prev.filter((b) => !String(b.id).startsWith('editor-')));
        // Re-fetch files so the grid is not blank
        fetchFiles();
    };

    // Mount OnlyOffice editor when config is ready
    // IMPORTANT: create the editor div imperatively so React never tries to
    //   remove DOM nodes that OnlyOffice has modified (fixes removeChild crash)
    useEffect(() => {
        if (!editorConfig || !editorContainerRef.current) return;

        // Wipe any previous content and create a fresh div for the editor
        const container = editorContainerRef.current;
        container.innerHTML = '';
        const editorDiv = document.createElement('div');
        editorDiv.id = 'onlyoffice-editor';
        editorDiv.style.height = '100%';
        editorDiv.style.width = '100%';
        container.appendChild(editorDiv);

        const initEditor = () => {
            if (editorInstanceRef.current) {
                try { editorInstanceRef.current.destroyEditor(); } catch (e) { }
            }
            // Inject save status tracking event into config
            const configWithEvents = {
                ...editorConfig,
                events: {
                    ...editorConfig.events,
                    onDocumentStateChange: (event) => {
                        // event.data: true = modified, false = saved
                        setSaveStatus(event.data ? 'unsaved' : 'saved');
                    },
                    onAppReady: () => console.log('OnlyOffice Ready'),
                    onError: (event) => console.error('OnlyOffice Error:', event),
                },
            };
            editorInstanceRef.current = new window.DocsAPI.DocEditor('onlyoffice-editor', configWithEvents);
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
            // Imperatively wipe so React doesn't try to removeChild on stale nodes
            container.innerHTML = '';
        };
    }, [editorConfig]);

    // ─── Open file ───
    const handleOpenFile = (file) => {
        if (file.is_folder) {
            handleNavigate(file.id, file.name);
            return;
        }
        const ext = file.name.split('.').pop().toLowerCase();

        // Markdown
        if (file.name.endsWith('.md')) {
            setMarkdownFile(file);
            setBreadcrumbs((prev) => [...prev, { id: `md-${file.id}`, name: file.name }]);
            return;
        }

        // Media (Video, Audio, Image)
        const isMedia =
            file.mime_type?.startsWith('video/') ||
            file.mime_type?.startsWith('audio/') ||
            file.mime_type?.startsWith('image/') ||
            /\.(mp4|webm|ogg|mov|mp3|wav|m4a|jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);

        if (isMedia) {
            setMediaFile(file);
            return;
        }

        // Editable documents
        const editableExts = ['docx', 'xlsx', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp', 'rtf', 'pdf'];
        if (editableExts.includes(ext)) {
            openEditor(file);
            return;
        }

        // Fallback: Download
        handleDownload(file);
    };

    // ─── Filtered & sorted files ───
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const sortedFiles = useMemo(() => {
        const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
        const filteredFiles = normalizedQuery
            ? files.filter((file) => file.name.toLowerCase().includes(normalizedQuery))
            : files;

        return [...filteredFiles].sort((a, b) => {
            if (a.is_folder && !b.is_folder) return -1;
            if (!a.is_folder && b.is_folder) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }, [files, deferredSearchQuery]);

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] transition-colors duration-200">
            <Sidebar
                currentFolder={currentFolder}
                onNavigate={handleNavigate}
                onCreateFolder={handleCreateFolder}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Navbar
                    breadcrumbs={breadcrumbs}
                    onBreadcrumbClick={(id) => {
                        if (String(id).startsWith('editor-')) return;
                        if (editingFile) closeEditor();
                        if (markdownFile) {
                            setMarkdownFile(null);
                            setBreadcrumbs(prev => prev.filter(b => !String(b.id).startsWith('md-')));
                        }
                        handleNavigate(id, breadcrumbs.find((b) => b.id === id)?.name);
                    }}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onUpload={handleUpload}
                    onUploadFolder={handleFolderUpload}
                    onToggleActivity={() => setActivityOpen((p) => !p)}
                    showBackButton={!!editingFile || !!markdownFile}
                    onBack={() => {
                        if (markdownFile) {
                            setMarkdownFile(null);
                            setBreadcrumbs(prev => prev.filter(b => !String(b.id).startsWith('md-')));
                            fetchFiles();
                        } else {
                            closeEditor();
                        }
                    }}
                />

                <div className="flex flex-1 overflow-hidden">
                    {/* Main content area */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Inline OnlyOffice Editor — always mounted, shown/hidden via CSS
                            to prevent React removeChild crash when OnlyOffice modifies the DOM */}
                        <div
                            ref={editorContainerRef}
                            className="h-full w-full"
                            style={{ display: editingFile ? 'block' : 'none' }}
                        />

                        {/* Markdown Editor — shown when a .md file is open */}
                        {markdownFile && (
                            <div className="h-full w-full">
                                <MarkdownEditor
                                    file={markdownFile}
                                    onClose={() => {
                                        setMarkdownFile(null);
                                        setBreadcrumbs(prev => prev.filter(b => !String(b.id).startsWith('md-')));
                                        fetchFiles();
                                    }}
                                />
                            </div>
                        )}

                        {/* Floating Save Status Badge */}
                        {editingFile && (
                            <div style={{
                                position: 'fixed',
                                top: '8px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 999999,
                                pointerEvents: 'none',
                                transition: 'opacity 0.3s ease',
                            }}>
                                {saveStatus === 'saved' ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 18px',
                                        borderRadius: '10px',
                                        backgroundColor: 'rgba(6, 95, 70, 0.95)',
                                        color: '#d1fae5',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                                        backdropFilter: 'blur(10px)',
                                    }}>
                                        <span style={{ fontSize: '16px' }}>✓</span> Saved to S3
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 18px',
                                        borderRadius: '10px',
                                        backgroundColor: 'rgba(146, 64, 14, 0.95)',
                                        color: '#fef3c7',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                                        backdropFilter: 'blur(10px)',
                                    }}>
                                        <span style={{ fontSize: '16px' }}>●</span> Unsaved Changes
                                    </div>
                                )}
                            </div>
                        )}

                        {/* File Grid — hidden when editor is open */}
                        <div className="px-5 py-4 smooth-panel" style={{ display: (editingFile || markdownFile) ? 'none' : 'block' }}>
                            {loading && hasLoadedOnce && (
                                <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                                    <span className="w-3.5 h-3.5 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                                    Refreshing files...
                                </div>
                            )}

                            {!hasLoadedOnce && loading ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 py-2">
                                    {Array.from({ length: 10 }).map((_, i) => (
                                        <div key={i} className="h-28 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] animate-pulse" />
                                    ))}
                                </div>
                            ) : (
                                <FileGrid
                                    files={sortedFiles}
                                    viewMode={viewMode}
                                    onOpen={handleOpenFile}
                                    onDownload={handleDownload}
                                    onDelete={handleDelete}
                                    onRename={handleRename}
                                    onExtract={handleExtract}
                                    onCreateFolder={handleCreateFolder}
                                    onUpload={handleUpload}
                                    onCreateDocument={handleCreateDocument}
                                    onRefresh={fetchFiles}
                                />
                            )}
                        </div>
                    </div>

                    {/* Modals */}
                    {mediaFile && (
                        <MediaViewerModal
                            file={mediaFile}
                            onClose={() => setMediaFile(null)}
                        />
                    )}

                    {/* Activity Bar */}
                    <ActivityBar
                        activities={activities}
                        open={activityOpen}
                        onClose={() => setActivityOpen(false)}
                    />
                </div>
            </main>
        </div>
    );
}
