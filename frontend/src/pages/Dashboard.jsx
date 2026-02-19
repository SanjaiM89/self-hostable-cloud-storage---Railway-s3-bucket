import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import Sidebar from '../components/Sidebar';
import ContentPane from '../components/ContentPane';
import Loader from '../components/Loader';
import ActivityBar from '../components/ActivityBar';
import MediaViewerModal from '../components/MediaViewerModal';
import { useMobile, MobileNav, MobileMediaViewer } from '../mobile';
import { filesAPI } from '../utils/api';
import { GripHorizontal, X } from 'lucide-react';

let activityIdCounter = 0;

export default function Dashboard() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { subscribe } = useWebSocket();
    const isMobile = useMobile();

    // ─── Pane Management ───
    const [panes, setPanes] = useState([
        { id: 'pane-1', folderId: null, scope: 'files' }
    ]);
    const [activePaneId, setActivePaneId] = useState('pane-1');
    const [activities, setActivities] = useState([]);
    const [activityOpen, setActivityOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [clipboard, setClipboard] = useState({ op: null, items: [] });
    // Pane Dragging
    const [draggedPaneId, setDraggedPaneId] = useState(null);

    // Global Media Viewer (Simple version, or we could move to ContentPane if we want per-pane)
    // The previous dashboard had a global one.
    // ContentPane has logic to detect media but currently just logs or downloads?
    // Let's add `onPreviewMedia` to ContentPane props and handle it here.
    const [mediaFile, setMediaFile] = useState(null);

    // ─── URL Sync ───
    useEffect(() => {
        const folderParam = searchParams.get('folder');
        const trashParam = searchParams.get('trash');

        let newFolderId = null;
        let newScope = 'files';

        if (trashParam) {
            newScope = 'trash';
        } else if (folderParam) {
            const numeric = Number(folderParam);
            if (!Number.isNaN(numeric)) newFolderId = numeric;
        }

        setPanes(prev => prev.map(p => {
            if (p.id === activePaneId) {
                return { ...p, folderId: newFolderId, scope: newScope };
            }
            return p;
        }));
    }, [searchParams]);

    // ─── Activity Helpers ───
    const addActivity = (type, name) => {
        const id = ++activityIdCounter;
        setActivities(prev => [{ id, type, name, status: 'running', percent: 0 }, ...prev]);
        setActivityOpen(true);
        return id;
    };

    const updateActivity = (id, updates) => {
        setActivities(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    // ─── Global Callbacks ───
    const handlePaneFocus = (paneId) => {
        setActivePaneId(paneId);
        const pane = panes.find(p => p.id === paneId);
        if (pane) updateUrl(pane.folderId, pane.scope);
    };

    const updateUrl = (folderId, scope) => {
        if (scope === 'trash') navigate('/?trash=1', { replace: true });
        else navigate(folderId ? `/?folder=${folderId}` : '/', { replace: true });
    };

    const handlePaneNavigate = (paneId, folderId, scope = 'files') => {
        setPanes(prev => prev.map(p => p.id === paneId ? { ...p, folderId, scope } : p));
        if (paneId === activePaneId) {
            updateUrl(folderId, scope);
        }
    };

    const handleSidebarNavigate = (folderId) => {
        const scope = 'files';
        handlePaneNavigate(activePaneId, folderId, scope);
    };

    const handleSplit = (startFolderId, initialFile = null) => {
        const newPaneId = `pane-${Date.now()}`;
        setPanes(prev => {
            if (prev.length >= 2) return prev;
            return [...prev, { id: newPaneId, folderId: startFolderId, scope: 'files', initialFile }];
        });
        setActivePaneId(newPaneId);
    };

    const handleClosePane = (paneId) => {
        if (panes.length <= 1) return;
        setPanes(prev => {
            const remaining = prev.filter(p => p.id !== paneId);
            if (activePaneId === paneId) {
                setActivePaneId(remaining[remaining.length - 1].id);
            }
            return remaining;
        });
    };

    const onPaste = async (targetFolderId) => {
        if (!clipboard.items.length || !clipboard.op) return;
        const ids = clipboard.items.map(f => f.id);
        const opName = clipboard.op === 'copy' ? 'Copying' : 'Moving';
        const aid = addActivity(clipboard.op, `${opName} ${ids.length} items`);

        try {
            if (clipboard.op === 'copy') {
                await filesAPI.batchCopy(ids, targetFolderId);
            } else {
                await filesAPI.batchMove(ids, targetFolderId);
            }
            updateActivity(aid, { status: 'done', percent: 100 });
            setClipboard({ op: null, items: [] });
        } catch (err) {
            updateActivity(aid, { status: 'error' });
            alert('Paste failed');
        }
    };

    // ContentPane needs a way to Set Clipboard.
    // We pass `onCopy` and `onCut` callbacks.
    const handleCopy = (files) => setClipboard({ op: 'copy', items: files });
    const handleCut = (files) => setClipboard({ op: 'move', items: files });
    const handleCancelPaste = () => setClipboard({ op: null, items: [] });

    // Pane Reordering
    const handlePaneDragStart = (e, paneId) => {
        if (panes.length < 2) {
            e.preventDefault();
            return;
        }
        setDraggedPaneId(paneId);
        e.dataTransfer.effectAllowed = 'move';
        // Transparent drag image potentially?
    };

    const handlePaneDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handlePaneDrop = (e, targetPaneId) => {
        e.preventDefault();
        if (!draggedPaneId || draggedPaneId === targetPaneId) return;

        // Swap logic
        setPanes(prev => {
            const newPanes = [...prev];
            const idx1 = newPanes.findIndex(p => p.id === draggedPaneId);
            const idx2 = newPanes.findIndex(p => p.id === targetPaneId);
            if (idx1 > -1 && idx2 > -1) {
                [newPanes[idx1], newPanes[idx2]] = [newPanes[idx2], newPanes[idx1]];
            }
            return newPanes;
        });
        setDraggedPaneId(null);
    };

    // Refs for accessing imperative handles of ContentPanes
    const paneRefs = useRef({});

    // ─── Sidebar Actions (Trigger on Active Pane) ───
    const handleSidebarAction = (action) => {
        const ref = paneRefs.current[activePaneId];
        if (!ref) return;

        switch (action) {
            case 'createFolder':
                ref.promptCreateFolder && ref.promptCreateFolder();
                break;
            case 'upload':
                ref.triggerUpload && ref.triggerUpload();
                break;
            case 'createDocument':
                ref.promptCreateDocument && ref.promptCreateDocument();
                break;
            case 'search':
                ref.openSearch && ref.openSearch();
                break;
        }
    };

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] transition-colors duration-200 main-content-area">
            <div className="desktop-sidebar">
                <Sidebar
                    currentFolder={panes.find(p => p.id === activePaneId)?.folderId}
                    onNavigate={handleSidebarNavigate}
                    onCreateFolder={() => handleSidebarAction('createFolder')}
                    onUpload={() => handleSidebarAction('upload')}
                    onCreateDocument={() => handleSidebarAction('createDocument')}
                    onOpenTrash={() => handlePaneNavigate(activePaneId, null, 'trash')}
                    onOpenSearch={() => handleSidebarAction('search')}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(p => !p)}
                />
            </div>

            <main className="flex-1 flex overflow-hidden relative">
                {panes.map((pane, index) => (
                    <div
                        key={pane.id}
                        className={`flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-300 ${index > 0 ? "border-l border-[var(--border-color)]" : ""}`}
                        onDragOver={handlePaneDragOver}
                        onDrop={(e) => handlePaneDrop(e, pane.id)}
                    >
                        {panes.length > 1 && (
                            <div
                                draggable
                                onDragStart={(e) => handlePaneDragStart(e, pane.id)}
                                className={`h-7 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing border-b border-[var(--border-color)] ${pane.id === activePaneId ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-primary)]'}`}
                                onClick={() => handlePaneFocus(pane.id)}
                            >
                                <div className="flex items-center gap-2">
                                    <GripHorizontal className="w-4 h-4 text-[var(--text-tertiary)]" />
                                    <span className="text-xs text-[var(--text-tertiary)] font-medium">Pane {index + 1}</span>
                                </div>
                                <button onClick={() => handleClosePane(pane.id)} className="p-0.5 rounded hover:bg-[var(--card-hover)]">
                                    <X className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                                </button>
                            </div>
                        )}

                        <ContentPane
                            ref={(el) => {
                                if (el) paneRefs.current[pane.id] = el;
                                else delete paneRefs.current[pane.id];
                            }}
                            paneId={pane.id}
                            isActive={pane.id === activePaneId}
                            initialFolder={pane.folderId}
                            initialScope={pane.scope}
                            initialFile={pane.initialFile} // Added prop
                            onFocus={() => handlePaneFocus(pane.id)}
                            onNavigate={(fid) => handlePaneNavigate(pane.id, fid)}
                            onSplit={handleSplit}
                            // onClose={() => handleClosePane(pane.id)} // Handled by the button in the header

                            addActivity={addActivity}
                            updateActivity={updateActivity}

                            clipboard={clipboard}
                            onPaste={onPaste}
                            onCopy={handleCopy}
                            onCut={handleCut}
                            onCancelPaste={handleCancelPaste}

                            wsSubscribe={subscribe}
                            className="" // We handled border in wrapper

                            // Media
                            onPreviewMedia={setMediaFile}
                        />
                    </div>
                ))}
            </main>

            <ActivityBar
                activities={activities}
                open={activityOpen}
                onClose={() => setActivityOpen(false)}
            />

            {mediaFile && (isMobile ? (
                <MobileMediaViewer file={mediaFile} onClose={() => setMediaFile(null)} />
            ) : (
                <MediaViewerModal file={mediaFile} onClose={() => setMediaFile(null)} />
            ))}

            {isMobile && (
                <MobileNav
                    activeTab={panes[0].scope === 'trash' ? 'trash' : 'home'}
                    onHome={() => handlePaneNavigate(activePaneId, null)}
                    onSearch={() => handleSidebarAction('search')}
                    onUpload={() => handleSidebarAction('upload')}
                    onCreateFolder={() => handleSidebarAction('createFolder')}
                    onCreateDocument={() => handleSidebarAction('createDocument')}
                    onTrash={() => handlePaneNavigate(activePaneId, null, 'trash')}
                    onNavigateSettings={() => navigate('/settings')}
                />
            )}
        </div>
    );
}
