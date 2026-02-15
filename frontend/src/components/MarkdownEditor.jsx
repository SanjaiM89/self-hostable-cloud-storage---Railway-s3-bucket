import { useState, useEffect, useCallback, useRef } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { filesAPI } from '../utils/api';
import { ArrowLeft, Save, Upload as UploadIcon } from 'lucide-react';

export default function MarkdownEditor({ file, onClose }) {
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [saveStatus, setSaveStatus] = useState('saved');
    const [loading, setLoading] = useState(true);
    const saveTimerRef = useRef(null);

    // Load file content
    useEffect(() => {
        const loadContent = async () => {
            try {
                setLoading(true);
                const res = await filesAPI.getContent(file.id);
                setContent(res.data.content || '');
                setOriginalContent(res.data.content || '');
            } catch (err) {
                console.error('Failed to load markdown:', err);
                setContent('# Error\n\nFailed to load file content.');
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, [file.id]);

    // Auto-save with debounce
    const saveContent = useCallback(async (text) => {
        setSaveStatus('saving');
        try {
            await filesAPI.saveContent(file.id, text);
            setSaveStatus('saved');
            setOriginalContent(text);
        } catch (err) {
            console.error('Save failed:', err);
            setSaveStatus('error');
        }
    }, [file.id]);

    const handleChange = useCallback((value) => {
        setContent(value);
        setSaveStatus('unsaved');

        // Debounced auto-save (1.5s)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveContent(value), 1500);
    }, [saveContent]);

    // Save on Ctrl+S
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveContent(content);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [content, saveContent]);

    // Save before closing
    const handleClose = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (content !== originalContent) {
            await saveContent(content);
        }
        onClose();
    }, [content, originalContent, saveContent, onClose]);

    // Image upload handler
    const handleImageUpload = useCallback(async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const imgFile = e.target.files[0];
            if (!imgFile) return;

            try {
                const formData = new FormData();
                formData.append('file', imgFile);
                const result = await filesAPI.upload(formData);
                const fileData = result.data;

                // Get download URL for the uploaded image
                const dlRes = await filesAPI.download(fileData.id);
                const imageUrl = dlRes.data.url;

                // Insert markdown image at cursor
                const imgMarkdown = `\n![${imgFile.name}](${imageUrl})\n`;
                setContent(prev => prev + imgMarkdown);
                setSaveStatus('unsaved');
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = setTimeout(() => saveContent(content + imgMarkdown), 1500);
            } catch (err) {
                console.error('Image upload failed:', err);
            }
        };
        input.click();
    }, [content, saveContent]);

    // Badge styles
    const badgeStyle = {
        saved: { bg: 'rgba(6, 95, 70, 0.95)', color: '#d1fae5', icon: '✓', text: 'Saved to S3' },
        unsaved: { bg: 'rgba(146, 64, 14, 0.95)', color: '#fef3c7', icon: '●', text: 'Unsaved' },
        saving: { bg: 'rgba(30, 64, 175, 0.95)', color: '#dbeafe', icon: '⟳', text: 'Saving...' },
        error: { bg: 'rgba(153, 27, 27, 0.95)', color: '#fecaca', icon: '✗', text: 'Save failed' },
    };
    const badge = badgeStyle[saveStatus] || badgeStyle.saved;

    if (loading) {
        return (
            <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '28px', height: '28px',
                        border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)',
                        borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                        margin: '0 auto 10px',
                    }} />
                    Loading markdown...
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }} data-color-mode="dark">
            {/* Toolbar */}
            <div style={{
                height: '42px', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0 12px', borderBottom: '1px solid var(--border-color)',
                background: 'var(--card-bg)', flexShrink: 0,
            }}>
                <button onClick={handleClose} style={toolBtnStyle} title="Back">
                    <ArrowLeft size={15} />
                </button>
                <span style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 6px' }} />
                <span style={{
                    fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                    maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginRight: '8px',
                }}>{file.name}</span>

                <button onClick={handleImageUpload} style={toolBtnStyle} title="Upload image"><UploadIcon size={14} /></button>

                {/* Save status */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '6px',
                        background: badge.bg, color: badge.color,
                        fontSize: '11px', fontWeight: 600,
                    }}>
                        <span style={{ fontSize: '12px' }}>{badge.icon}</span> {badge.text}
                    </div>
                    <button onClick={() => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveContent(content); }}
                        style={toolBtnStyle} title="Save now (Ctrl+S)"><Save size={14} /></button>
                </div>
            </div>

            {/* WYSIWYG Markdown Editor */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                <MDEditor
                    value={content}
                    onChange={handleChange}
                    height="100%"
                    preview="live"
                    hideToolbar={false}
                    enableScroll={true}
                    visibleDragbar={false}
                    style={{
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                    }}
                />
            </div>

            {/* Custom dark theme styles */}
            <style>{`
                .w-md-editor {
                    background: var(--bg-primary) !important;
                    color: var(--text-primary) !important;
                    border: none !important;
                }
                .w-md-editor-toolbar {
                    background: var(--card-bg) !important;
                    border-bottom: 1px solid var(--border-color) !important;
                }
                .w-md-editor-toolbar button {
                    color: var(--text-secondary) !important;
                }
                .w-md-editor-toolbar button:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                .w-md-editor-text-pre, .w-md-editor-text-input {
                    background: var(--bg-primary) !important;
                    color: var(--text-primary) !important;
                }
                .w-md-editor-preview {
                    background: var(--bg-secondary, #181825) !important;
                }
                .wmde-markdown {
                    background: transparent !important;
                    color: var(--text-primary) !important;
                }
                .wmde-markdown h1 { border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
                .wmde-markdown h2 { border-bottom: 1px solid var(--border-color); padding-bottom: 6px; }
                .wmde-markdown code {
                    background: rgba(255,255,255,0.08);
                    padding: 2px 6px;
                    border-radius: 4px;
                    color: #f38ba8;
                }
                .wmde-markdown pre {
                    background: rgba(0,0,0,0.3) !important;
                    border-radius: 8px;
                }
                .wmde-markdown a {
                    color: var(--accent);
                }
                .wmde-markdown blockquote {
                    border-left: 3px solid var(--accent);
                    background: rgba(255,255,255,0.03);
                    border-radius: 0 6px 6px 0;
                }
                .wmde-markdown table {
                    border-collapse: collapse;
                }
                .wmde-markdown th, .wmde-markdown td {
                    border: 1px solid var(--border-color);
                }
                .wmde-markdown th {
                    background: rgba(255,255,255,0.05);
                }
            `}</style>
        </div>
    );
}

// Toolbar button base style
const toolBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '28px', borderRadius: '6px',
    border: 'none', cursor: 'pointer',
    background: 'transparent', color: 'var(--text-secondary)',
    transition: 'all 0.15s',
};
