import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Download, File, Lock } from 'lucide-react';
import { sharesAPI } from '../utils/api';
import MarkdownViewer from '../components/MarkdownViewer';

export default function SharedFilePage() {
    const { token } = useParams();
    const [fileInfo, setFileInfo] = useState(null);
    const [editorConfig, setEditorConfig] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const editorContainerRef = useRef(null);
    const editorInstanceRef = useRef(null);

    const editableExts = /\.(docx?|xlsx?|pptx?|odt|ods|odp|csv|txt|rtf|pdf)$/i;

    useEffect(() => {
        loadFile();
    }, [token]);

    const loadFile = async () => {
        try {
            const res = await sharesAPI.publicInfo(token);
            setFileInfo(res.data);

            // If file is OnlyOffice-compatible, load editor config
            if (editableExts.test(res.data.name)) {
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

    const handleDownload = async () => {
        try {
            const res = await sharesAPI.publicDownload(token);
            window.open(res.data.url, '_blank');
        } catch (e) {
            setError(e.response?.data?.detail || 'Download not allowed');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="w-8 h-8 border-3 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="text-center space-y-4">
                    <Lock className="w-12 h-12 mx-auto text-[var(--text-tertiary)]" />
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Access Denied</h2>
                    <p className="text-[var(--text-secondary)] text-sm">{error}</p>
                </div>
            </div>
        );
    }

    // If OnlyOffice editor is available, show fullscreen editor
    if (editorConfig) {
        return (
            <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)]">
                {/* Minimal top bar */}
                <div className="h-10 flex items-center px-4 border-b border-[var(--border-color)] bg-[var(--card-bg)] shrink-0">
                    <File className="w-4 h-4 text-[var(--accent)] mr-2" />
                    <span className="text-[13px] text-[var(--text-primary)] font-medium truncate">{fileInfo.name}</span>
                    <span className="ml-2 text-[10px] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)]">
                        {fileInfo.permission === 'view' ? 'View Only' : fileInfo.permission === 'download' ? 'View & Download' : 'Editing'}
                    </span>
                    {fileInfo.shared_by && (
                        <span className="ml-3 text-[11px] text-[var(--text-secondary)]">
                            Shared by <strong className="text-[var(--accent)]">{fileInfo.shared_by}</strong>
                        </span>
                    )}
                    {fileInfo.permission !== 'view' && (
                        <button
                            onClick={handleDownload}
                            className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg text-[12px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                        >
                            <Download className="w-3.5 h-3.5" /> Download
                        </button>
                    )}
                </div>
                <div ref={editorContainerRef} className="flex-1" />
            </div>
        );
    }

    // If markdown file, show MarkdownViewer
    if (fileInfo && fileInfo.name.endsWith('.md')) {
        return <MarkdownViewer token={token} fileInfo={fileInfo} />;
    }

    // Non-editable file: show file card with download
    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
            <div className="w-[400px] rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl overflow-hidden">
                <div className="p-8 text-center">
                    <File className="w-16 h-16 mx-auto text-[var(--accent)] mb-4" />
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{fileInfo.name}</h2>
                    <p className="text-[13px] text-[var(--text-tertiary)] mb-1">
                        {(fileInfo.size / 1024).toFixed(1)} KB • Shared file
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
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-[14px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                        >
                            <Download className="w-4 h-4" /> Download File
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
