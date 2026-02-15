import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { filesAPI } from '../utils/api'; // Ensure this is correct import
import api from '../utils/api'; // Fallback
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditorPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('Document');
    const editorInstanceRef = useRef(null);

    useEffect(() => {
        let mounted = true;

        const initDocSpaceEditor = (config) => {
            if (!mounted) return;
            try {
                // DocSpace SDK initialization
                // We assume window.DocSpace.SDK is available
                if (!window.DocSpace || !window.DocSpace.SDK) {
                    throw new Error("DocSpace SDK not found");
                }

                const frame = window.DocSpace.SDK.initEditor({
                    url: config.docspace_url,
                    id: config.file_id,
                    mode: config.mode || 'edit',
                    width: "100%",
                    height: "100%",
                    events: {
                        onAppReady: () => console.log('DocSpace Ready'),
                        onError: (err) => console.error('DocSpace Error:', err),
                    }
                });

                const container = document.getElementById('onlyoffice-editor');
                if (container) {
                    container.innerHTML = ''; // Clear previous
                    // If frame is node, append. If it's just created in place, good.
                    // SDK usually returns the iframe or key.
                    // We'll try appending if it returns a node.
                    if (frame instanceof Node) {
                        container.appendChild(frame);
                    }
                }
                editorInstanceRef.current = frame;
                setLoading(false);

            } catch (err) {
                console.error("Failed to init DocSpace editor:", err);
                if (mounted) setError('Failed to initialize DocSpace editor');
                setLoading(false);
            }
        };

        const fetchConfig = async () => {
            try {
                // Fetch config from backend
                // Use filesAPI if available, or api directly
                const res = await api.get(`/files/editor-config/${fileId}`);
                const config = res.data; // { docspace_url, file_id, mode, file_name }

                if (mounted) setFileName(config.file_name || 'Document');

                // Load SDK if needed
                if (window.DocSpace) {
                    initDocSpaceEditor(config);
                } else {
                    const script = document.createElement('script');
                    // SDK URL
                    script.src = `${config.docspace_url}/static/scripts/sdk/1.0.0/api.js`;
                    script.async = true;
                    script.onload = () => initDocSpaceEditor(config);
                    script.onerror = () => {
                        if (mounted) {
                            setError('Failed to load DocSpace API script');
                            setLoading(false);
                        }
                    };
                    document.head.appendChild(script);
                }

            } catch (err) {
                console.error('Failed to load editor config:', err);
                if (mounted) {
                    setError(err.response?.data?.detail || 'Failed to load editor configuration');
                    setLoading(false);
                }
            }
        };

        fetchConfig();

        return () => {
            mounted = false;
            // Cleanup? DocSpace SDK doesn't seem to have destroy?
            // We just clear the container.
            const container = document.getElementById('onlyoffice-editor');
            if (container) container.innerHTML = '';
        };
    }, [fileId]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[var(--bg-primary)] gap-4">
                <p className="text-red-500 text-center max-w-md">{error}</p>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-green-500 hover:text-green-600 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to files
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)]">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-[var(--text-primary)]">{fileName}</span>
                {loading && (
                    <Loader2 className="w-4 h-4 text-green-500 animate-spin ml-2" />
                )}
            </div>
            <div className="flex-1 overflow-hidden relative">
                {/* OnlyOffice Container */}
                <div id="onlyoffice-editor" className="w-full h-full" />
            </div>
        </div>
    );
}
