import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import FileGrid from '../components/FileGrid';
import ActivityBar from '../components/ActivityBar';
import { filesAPI } from '../utils/api';

let activityIdCounter = 0;

export default function Dashboard() {
    const [files, setFiles] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'Home' }]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [loading, setLoading] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const [activities, setActivities] = useState([]);

    // Inline editor state
    const [editingFile, setEditingFile] = useState(null);
    const [editorConfig, setEditorConfig] = useState(null);
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'unsaved'
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    // ─── File fetching ───
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await filesAPI.list(currentFolder);
            setFiles(res.data || []);
        } catch (err) {
            console.error('Failed to fetch files:', err);
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
            // Auto-open the new document in editor
            openEditor(res.data);
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
        const editableExts = /\.(docx?|xlsx?|pptx?|pdf|odt|ods|odp|csv|txt|rtf)$/i;
        if (editableExts.test(file.name)) {
            openEditor(file);
        } else {
            handleDownload(file);
        }
    };

    // ─── Filtered & sorted files ───
    const filteredFiles = files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const sortedFiles = [...filteredFiles].sort((a, b) => {
        if (a.is_folder && !b.is_folder) return -1;
        if (!a.is_folder && b.is_folder) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

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
                        handleNavigate(id, breadcrumbs.find((b) => b.id === id)?.name);
                    }}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onUpload={handleUpload}
                    onToggleActivity={() => setActivityOpen((p) => !p)}
                    showBackButton={!!editingFile}
                    onBack={closeEditor}
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

                        {/* Floating Save Status Badge */}
                        {editingFile && (
                            <div style={{
                                position: 'fixed',
                                bottom: '20px',
                                right: '20px',
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
                        <div className="px-5 py-4" style={{ display: editingFile ? 'none' : 'block' }}>
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="w-6 h-6 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
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
