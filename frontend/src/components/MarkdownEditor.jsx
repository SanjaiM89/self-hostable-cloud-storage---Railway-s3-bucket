import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { filesAPI } from '../utils/api';
import {
    Eye, Edit3, Columns, Image as ImageIcon,
    Bold, Italic, Code, Heading, List, Link,
    Save, ArrowLeft
} from 'lucide-react';

export default function MarkdownEditor({ file, onClose }) {
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [saveStatus, setSaveStatus] = useState('saved');
    const [viewMode, setViewMode] = useState('split'); // 'edit', 'preview', 'split'
    const [loading, setLoading] = useState(true);
    const saveTimerRef = useRef(null);
    const textareaRef = useRef(null);

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

    const handleChange = useCallback((e) => {
        const newContent = e.target.value;
        setContent(newContent);
        setSaveStatus('unsaved');

        // Debounced auto-save (1.5s)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveContent(newContent), 1500);
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
                const ta = textareaRef.current;
                if (ta) {
                    const pos = ta.selectionStart;
                    const before = content.substring(0, pos);
                    const after = content.substring(pos);
                    const imgMarkdown = `\n![${imgFile.name}](${imageUrl})\n`;
                    const newContent = before + imgMarkdown + after;
                    setContent(newContent);
                    setSaveStatus('unsaved');
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = setTimeout(() => saveContent(newContent), 1500);
                }
            } catch (err) {
                console.error('Image upload failed:', err);
            }
        };
        input.click();
    }, [content, saveContent]);

    // Toolbar insert helpers
    const insertAtCursor = useCallback((before, after = '') => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = content.substring(start, end);
        const newContent = content.substring(0, start) + before + selected + after + content.substring(end);
        setContent(newContent);
        setSaveStatus('unsaved');
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => saveContent(newContent), 1500);
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = start + before.length;
            ta.selectionEnd = start + before.length + selected.length;
        }, 0);
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
        }}>
            {/* Toolbar */}
            <div style={{
                height: '42px', display: 'flex', alignItems: 'center', gap: '2px',
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

                {/* Format buttons */}
                <button onClick={() => insertAtCursor('**', '**')} style={toolBtnStyle} title="Bold"><Bold size={14} /></button>
                <button onClick={() => insertAtCursor('*', '*')} style={toolBtnStyle} title="Italic"><Italic size={14} /></button>
                <button onClick={() => insertAtCursor('# ')} style={toolBtnStyle} title="Heading"><Heading size={14} /></button>
                <button onClick={() => insertAtCursor('`', '`')} style={toolBtnStyle} title="Inline code"><Code size={14} /></button>
                <button onClick={() => insertAtCursor('\n```\n', '\n```\n')} style={toolBtnStyle} title="Code block">
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700 }}>{'{ }'}</span>
                </button>
                <button onClick={() => insertAtCursor('- ')} style={toolBtnStyle} title="List"><List size={14} /></button>
                <button onClick={() => insertAtCursor('[', '](url)')} style={toolBtnStyle} title="Link"><Link size={14} /></button>
                <button onClick={handleImageUpload} style={toolBtnStyle} title="Upload image"><ImageIcon size={14} /></button>
                <span style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 6px' }} />

                {/* View mode toggles */}
                <button onClick={() => setViewMode('edit')} style={{
                    ...toolBtnStyle,
                    background: viewMode === 'edit' ? 'var(--accent)' : undefined,
                    color: viewMode === 'edit' ? '#1e1e2e' : undefined,
                }} title="Edit only"><Edit3 size={14} /></button>
                <button onClick={() => setViewMode('split')} style={{
                    ...toolBtnStyle,
                    background: viewMode === 'split' ? 'var(--accent)' : undefined,
                    color: viewMode === 'split' ? '#1e1e2e' : undefined,
                }} title="Split view"><Columns size={14} /></button>
                <button onClick={() => setViewMode('preview')} style={{
                    ...toolBtnStyle,
                    background: viewMode === 'preview' ? 'var(--accent)' : undefined,
                    color: viewMode === 'preview' ? '#1e1e2e' : undefined,
                }} title="Preview only"><Eye size={14} /></button>

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

            {/* Editor + Preview panes */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Editor pane */}
                {(viewMode === 'edit' || viewMode === 'split') && (
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        borderRight: viewMode === 'split' ? '1px solid var(--border-color)' : 'none',
                    }}>
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleChange}
                            spellCheck={false}
                            style={{
                                flex: 1, resize: 'none', border: 'none', outline: 'none',
                                padding: '20px 24px',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                                fontSize: '13.5px', lineHeight: '1.7',
                                tabSize: 4,
                            }}
                            onKeyDown={(e) => {
                                // Tab support
                                if (e.key === 'Tab') {
                                    e.preventDefault();
                                    const start = e.target.selectionStart;
                                    const end = e.target.selectionEnd;
                                    const newContent = content.substring(0, start) + '    ' + content.substring(end);
                                    setContent(newContent);
                                    setTimeout(() => {
                                        e.target.selectionStart = e.target.selectionEnd = start + 4;
                                    }, 0);
                                }
                            }}
                        />
                    </div>
                )}

                {/* Preview pane */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '24px 32px',
                        background: 'var(--bg-secondary, #181825)',
                    }}>
                        <div className="markdown-preview" style={{ maxWidth: '800px', margin: '0 auto' }}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                    code({ node, inline, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || '');
                                        return !inline && match ? (
                                            <SyntaxHighlighter
                                                style={oneDark}
                                                language={match[1]}
                                                PreTag="div"
                                                customStyle={{
                                                    borderRadius: '8px',
                                                    fontSize: '13px',
                                                    margin: '16px 0',
                                                }}
                                                {...props}
                                            >
                                                {String(children).replace(/\n$/, '')}
                                            </SyntaxHighlighter>
                                        ) : !inline ? (
                                            <SyntaxHighlighter
                                                style={oneDark}
                                                language="text"
                                                PreTag="div"
                                                customStyle={{
                                                    borderRadius: '8px',
                                                    fontSize: '13px',
                                                    margin: '16px 0',
                                                }}
                                                {...props}
                                            >
                                                {String(children).replace(/\n$/, '')}
                                            </SyntaxHighlighter>
                                        ) : (
                                            <code style={{
                                                background: 'rgba(255,255,255,0.08)',
                                                padding: '2px 6px', borderRadius: '4px',
                                                fontSize: '0.9em', fontFamily: 'monospace',
                                                color: '#f38ba8',
                                            }} {...props}>
                                                {children}
                                            </code>
                                        );
                                    },
                                    img({ src, alt, ...props }) {
                                        return (
                                            <img
                                                src={src} alt={alt || ''}
                                                style={{
                                                    maxWidth: '100%', borderRadius: '8px',
                                                    margin: '12px 0', cursor: 'pointer',
                                                }}
                                                {...props}
                                            />
                                        );
                                    },
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}
            </div>

            {/* Markdown preview styles */}
            <style>{`
                .markdown-preview { color: var(--text-primary); }
                .markdown-preview h1 { font-size: 2em; font-weight: 700; margin: 24px 0 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
                .markdown-preview h2 { font-size: 1.5em; font-weight: 600; margin: 20px 0 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; }
                .markdown-preview h3 { font-size: 1.25em; font-weight: 600; margin: 16px 0 8px; }
                .markdown-preview h4 { font-size: 1.1em; font-weight: 600; margin: 14px 0 6px; }
                .markdown-preview p { margin: 8px 0; line-height: 1.7; }
                .markdown-preview ul, .markdown-preview ol { padding-left: 24px; margin: 8px 0; }
                .markdown-preview li { margin: 4px 0; line-height: 1.6; }
                .markdown-preview blockquote { border-left: 3px solid var(--accent); padding: 8px 16px; margin: 12px 0; background: rgba(255,255,255,0.03); border-radius: 0 6px 6px 0; }
                .markdown-preview a { color: var(--accent); text-decoration: none; }
                .markdown-preview a:hover { text-decoration: underline; }
                .markdown-preview table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                .markdown-preview th, .markdown-preview td { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
                .markdown-preview th { background: rgba(255,255,255,0.05); font-weight: 600; }
                .markdown-preview hr { border: none; border-top: 1px solid var(--border-color); margin: 20px 0; }
                .markdown-preview pre { margin: 0 !important; }
                .markdown-preview strong { font-weight: 600; }
                .markdown-preview em { font-style: italic; }
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
