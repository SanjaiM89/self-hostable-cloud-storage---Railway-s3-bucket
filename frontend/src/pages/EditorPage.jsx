import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { filesAPI } from '../utils/api';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../utils/api';

const ONLYOFFICE_URL = 'http://localhost:8080';

export default function EditorPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('Document');
    const editorInitialized = useRef(false);

    useEffect(() => {
        if (editorInitialized.current) return;

        const initEditor = async () => {
            try {
                // Fetch the JWT-signed editor config from backend
                const res = await api.get(`/files/editor-config/${fileId}`);
                const config = res.data;
                setFileName(config.document?.title || 'Document');

                // Load OnlyOffice API script
                const script = document.createElement('script');
                script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`;
                script.onload = () => {
                    if (window.DocsAPI) {
                        editorInitialized.current = true;
                        new window.DocsAPI.DocEditor('onlyoffice-editor', config);
                        setLoading(false);
                    }
                };
                script.onerror = () => {
                    setError('Failed to load OnlyOffice editor. Make sure the OnlyOffice container is running.');
                    setLoading(false);
                };
                document.head.appendChild(script);
            } catch (err) {
                console.error('Failed to load editor config:', err);
                setError(err.response?.data?.detail || 'Failed to load editor configuration');
                setLoading(false);
            }
        };

        initEditor();
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
            <div className="flex-1">
                <div id="onlyoffice-editor" className="w-full h-full" />
            </div>
        </div>
    );
}
