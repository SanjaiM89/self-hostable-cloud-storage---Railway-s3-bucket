import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api'; // Ensure axios instance is used
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditorPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('Document');
    const editorInstanceRef = useRef(null);

    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'

    useEffect(() => {
        let mounted = true;

        const initOnlyOfficeEditor = (config) => {
            if (!mounted) return;
            try {
                if (!window.DocsAPI) {
                    throw new Error("OnlyOffice DocsAPI not found. Script load failed?");
                }

                const editorConfig = {
                    document: config.document,
                    documentType: config.documentType,
                    editorConfig: config.editorConfig,
                    token: config.token,
                    width: "100%",
                    height: "100%",
                    events: {
                        onAppReady: () => console.log('OnlyOffice Ready'),
                        // Track Save State
                        onDocumentStateChange: (event) => {
                            // event.data: true (modified), false (unmodified/saved)
                            if (event.data) {
                                setSaveStatus('unsaved');
                            } else {
                                setSaveStatus('saved');
                            }
                        },
                        onRequestEditRights: () => {
                            // This event happens when user tries to edit. We can force save here?? No.
                        },
                        onError: (event) => {
                            console.error('OnlyOffice Error Event:', event);
                            if (event && event.data) {
                                console.error("Error Code:", event.data.errorCode);
                                console.error("Error Description:", event.data.errorDescription);
                            }
                        },
                        // Validation error?
                        onRequestClose: () => {
                            console.log("Closing Editor");
                            navigate("/");
                        }
                    }
                };

                // Force Autosave locally in config if possible
                // (Already set in backend: customization.autosave = true)

                console.log("Initializing OnlyOffice with config:", editorConfig);

                // DocsAPI.DocEditor takes ID of the container
                const docEditor = new window.DocsAPI.DocEditor("onlyoffice-editor", editorConfig);
                editorInstanceRef.current = docEditor;
                setLoading(false);

            } catch (err) {
                console.error("Failed to init OnlyOffice editor:", err);
                if (mounted) setError('Failed to initialize OnlyOffice editor: ' + err.message);
                setLoading(false);
            }
        };

        const fetchConfig = async () => {
            try {
                setLoading(true);
                // Fetch config from backend
                const res = await api.get(`/files/editor-config/${fileId}`);
                const config = res.data;
                // config contains: document, documentType, editorConfig, token, onlyoffice_url

                if (mounted) setFileName(config.document?.title || 'Document');

                // Prioritize Env Var (Vercel) -> Backend Config -> Default
                const onlyofficeUrl = import.meta.env.VITE_ONLYOFFICE_URL || config.onlyoffice_url;
                console.log("Using OnlyOffice URL:", onlyofficeUrl);

                if (!onlyofficeUrl) {
                    throw new Error("OnlyOffice URL not found in Env (VITE_ONLYOFFICE_URL) or Backend Config");
                }

                // Check if script already loaded
                if (window.DocsAPI) {
                    initOnlyOfficeEditor(config);
                } else {
                    const script = document.createElement('script');
                    // Standard URL: /web-apps/apps/api/documents/api.js
                    // Remove trailing slash just in case
                    const baseUrl = onlyofficeUrl.replace(/\/$/, "");
                    script.src = `${baseUrl}/web-apps/apps/api/documents/api.js`;
                    script.async = true;
                    script.onload = () => initOnlyOfficeEditor(config);
                    script.onerror = () => {
                        if (mounted) {
                            setError(`Failed to load OnlyOffice API from ${script.src}`);
                            setLoading(false);
                        }
                    };
                    document.head.appendChild(script);
                }

            } catch (err) {
                console.error('Failed to load editor config:', err);
                if (mounted) {
                    setError(err.response?.data?.detail || err.message || 'Failed to load editor configuration');
                    setLoading(false);
                }
            }
        };

        fetchConfig();

        // Cleanup function
        return () => {
            mounted = false;
            if (editorInstanceRef.current) {
                if (editorInstanceRef.current.destroyEditor) {
                    editorInstanceRef.current.destroyEditor();
                }
                editorInstanceRef.current = null;
            }

            const container = document.getElementById('onlyoffice-editor');
            if (container) container.innerHTML = "";
        };
    }, [fileId, navigate]);

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 justify-between flex-shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Back to Files"
                    >
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[300px]">
                            {fileName}
                        </h1>
                        <span className="text-xs text-gray-500">OnlyOffice Editor</span>
                    </div>
                    {/* Status Badge */}
                    <div className="ml-4">
                        {saveStatus === 'saved' && (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium">
                                Saved to S3
                            </span>
                        )}
                        {saveStatus === 'unsaved' && (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-medium">
                                Unsaved Changes...
                            </span>
                        )}
                        {saveStatus === 'saving' && (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                                Uploading to S3...
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions could go here */}
            </header>

            {/* Editor Container */}
            <div className="flex-1 relative overflow-hidden bg-gray-100">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            <p className="text-sm text-gray-500">Loading Editor...</p>
                            <p className="text-xs text-gray-400">If this takes long, the OnlyOffice server might be waking up (Render)</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
                        <div className="max-w-md p-6 bg-red-50 rounded-lg text-center">
                            <p className="text-red-600 font-medium mb-2">Error Loading Editor</p>
                            <p className="text-sm text-gray-600">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {/* The ID must match what we pass to DocsAPI */}
                <div id="onlyoffice-editor" className="w-full h-full"></div>
            </div>

            {/* OnlyOffice script injection happens in useEffect */}
        </div>
    );
}
