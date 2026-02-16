import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { filesAPI } from '../utils/api';
import Loader from './Loader';
import {
    ArrowLeft, Save, Upload as UploadIcon,
    Bold, Italic, Heading1, Heading2, List, ListOrdered,
    Quote, Code, Image as ImageIcon, Link as LinkIcon,
    Undo, Redo
} from 'lucide-react';

const FONT_SIZE_STORAGE_KEY = 'md_font_size_preference_v1';
const PENDING_UPLOAD_STORAGE_KEY = 'md_pending_uploads_v1';
const FONT_SIZE_META_RE = /<!--\s*md-font-size:(\d+)\s*-->/;

function parseMarkdownMeta(markdown = '') {
    const match = markdown.match(FONT_SIZE_META_RE);
    const size = match ? Number(match[1]) : null;
    const clean = markdown.replace(FONT_SIZE_META_RE, '').trimStart();
    return { cleanContent: clean, fontSize: Number.isFinite(size) ? size : null };
}

function withMarkdownMeta(markdown = '', fontSize = 18) {
    const clean = markdown.replace(FONT_SIZE_META_RE, '').trimStart();
    return `<!-- md-font-size:${fontSize} -->\n${clean}`;
}

const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                renderHTML: attributes => {
                    if (!attributes.width) return {};
                    return {
                        width: attributes.width,
                        style: `width: ${attributes.width}`,
                    };
                },
            },
            uploadId: {
                default: null,
                parseHTML: element => element.getAttribute('data-upload-id'),
                renderHTML: attributes => attributes.uploadId ? { 'data-upload-id': attributes.uploadId } : {},
            },
        };
    },
});

export default function MarkdownEditor({ file, onClose }) {
    const [originalContent, setOriginalContent] = useState('');
    const [saveStatus, setSaveStatus] = useState('saved');
    const [loading, setLoading] = useState(true);
    const [fontSize, setFontSize] = useState(() => {
        const saved = Number(localStorage.getItem(FONT_SIZE_STORAGE_KEY));
        return Number.isFinite(saved) && saved >= 14 && saved <= 26 ? saved : 18;
    });

    const pendingUploadsRef = useRef({});
    const saveTimerRef = useRef(null);
    const editorRef = useRef(null); // Ref to access editor inside callbacks that are defined before editor

    // 1. Helpers that don't depend on editor
    const persistPendingUploads = useCallback(() => {
        localStorage.setItem(PENDING_UPLOAD_STORAGE_KEY, JSON.stringify(Object.values(pendingUploadsRef.current)));
    }, []);

    const fileToDataUrl = useCallback((imgFile) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imgFile);
    }), []);

    // 2. Save Content (needed by useEditor onUpdate)
    const saveContent = useCallback(async (text) => {
        setSaveStatus('saving');
        try {
            const contentWithMeta = withMarkdownMeta(text, fontSize);

            // Optimistic update to SessionStorage
            try {
                sessionStorage.setItem(`file_content_${file.id}`, contentWithMeta);
            } catch (e) { /* ignore quota */ }

            await filesAPI.saveContent(file.id, contentWithMeta);
            localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
            setSaveStatus('saved');
            setOriginalContent(contentWithMeta);
        } catch (err) {
            console.error('Save failed:', err);
            setSaveStatus('error');
        }
    }, [file.id, fontSize]);

    // 3. Image Upload Helper (dependent on API only)
    const uploadImage = useCallback(async (file) => {
        try {
            setSaveStatus('saving');
            const formData = new FormData();
            formData.append('file', file);
            const result = await filesAPI.upload(formData);
            const fileData = result.data;

            // Get download URL for the uploaded image
            const dlRes = await filesAPI.download(fileData.id);
            return dlRes.data.url;
        } catch (err) {
            console.error('Image upload failed:', err);
            setSaveStatus('error');
            return null;
        }
    }, []);

    // 4. Callbacks that rely on editorRef (to avoid circular dependency/TDZ)
    const replaceUploadedImage = useCallback((uploadId, remoteUrl) => {
        const editor = editorRef.current;
        if (!editor) return;

        let tr = editor.state.tr;
        let changed = false;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.uploadId === uploadId) {
                tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: remoteUrl, uploadId: null });
                changed = true;
            }
        });
        if (changed) {
            editor.view.dispatch(tr);
        }
    }, []);

    const enqueueImageUpload = useCallback(async (imgFile, insertAtPos = null) => {
        const editor = editorRef.current;
        if (!editor || !imgFile) return;

        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewSrc = await fileToDataUrl(imgFile);

        const imageAttrs = { src: previewSrc, alt: imgFile.name || 'Pasted Image', uploadId };
        if (insertAtPos === null) {
            editor.chain().focus().setImage(imageAttrs).run();
        } else {
            const node = editor.state.schema.nodes.image.create(imageAttrs);
            const tr = editor.state.tr.insert(insertAtPos, node);
            editor.view.dispatch(tr);
        }

        pendingUploadsRef.current[uploadId] = {
            id: uploadId,
            name: imgFile.name || 'image',
            type: imgFile.type || 'image/*',
            size: imgFile.size || 0,
            createdAt: Date.now(),
        };
        persistPendingUploads();

        uploadImage(imgFile).then((remoteUrl) => {
            if (remoteUrl) {
                replaceUploadedImage(uploadId, remoteUrl);
                setSaveStatus('unsaved');
                const markdown = editor.storage.markdown.getMarkdown();
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = setTimeout(() => saveContent(markdown), 700);
            }
        }).finally(() => {
            delete pendingUploadsRef.current[uploadId];
            persistPendingUploads();
        });
    }, [fileToDataUrl, persistPendingUploads, replaceUploadedImage, uploadImage, saveContent]);

    // 5. useEditor Hook
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: true,
            }),
            Typography,
            CustomImage.configure({
                inline: true,
                allowBase64: true,
            }),
            Placeholder.configure({
                placeholder: 'Start writing...',
            }),
            Markdown.configure({
                html: true,
                transformPastedText: true,
                transformCopiedText: true,
            }),
        ],
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-150px)] px-8 py-6',
            },
            handleDrop: (view, event, slice, moved) => {
                if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                    const file = event.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        event.preventDefault();
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        enqueueImageUpload(file, coordinates?.pos ?? null);
                        return true;
                    }
                }
                return false;
            },
            handlePaste: (view, event, slice) => {
                const items = event.clipboardData?.items;
                if (items) {
                    for (const item of items) {
                        if (item.type.indexOf('image') !== -1) {
                            event.preventDefault();
                            const file = item.getAsFile();
                            enqueueImageUpload(file);
                            return true;
                        }
                    }
                }
                return false;
            },
        },
        onUpdate: ({ editor }) => {
            setSaveStatus('unsaved');
            const markdown = editor.storage.markdown.getMarkdown();

            // Debounced auto-save (1.5s)
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => saveContent(markdown), 1500);
        },
    });

    // 6. Sync editorRef
    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    // Save on Ctrl+S
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (editor) {
                    const markdown = editor.storage.markdown.getMarkdown();
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    saveContent(markdown);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [editor, saveContent]);

    // Load file content
    useEffect(() => {
        const loadContent = async () => {
            try {
                setLoading(true);

                // Try SessionStorage first
                const cached = sessionStorage.getItem(`file_content_${file.id}`);
                if (cached) {
                    const { cleanContent, fontSize: metaFontSize } = parseMarkdownMeta(cached);
                    if (metaFontSize) {
                        setFontSize(metaFontSize);
                    }
                    setOriginalContent(cached);
                    if (editor) editor.commands.setContent(cleanContent);
                    setLoading(false); // Valid to show immediately
                }

                // Stale-while-revalidate pattern
                const res = await filesAPI.getContent(file.id);
                const content = res.data.content || '';

                // Only update if different (or if we didn't have cache)
                if (content !== cached) {
                    const { cleanContent, fontSize: metaFontSize } = parseMarkdownMeta(content);
                    if (metaFontSize) {
                        setFontSize(metaFontSize);
                        localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(metaFontSize));
                    }
                    setOriginalContent(content);
                    if (editor) {
                        const current = editor.storage.markdown.getMarkdown();
                        if (!cached || current === parseMarkdownMeta(cached).cleanContent) {
                            editor.commands.setContent(cleanContent);
                        }
                    }
                    sessionStorage.setItem(`file_content_${file.id}`, content);
                }
            } catch (err) {
                console.error('Failed to load markdown:', err);
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, [file.id, editor]); // Editor dependency is safe as it's passed into effect

    // Save before closing
    const handleClose = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (editor) {
            const currentMarkdown = editor.storage.markdown.getMarkdown();
            if (saveStatus === 'unsaved') {
                await saveContent(currentMarkdown);
            }
        }
        onClose();
    }, [editor, saveStatus, saveContent, onClose]);

    // Image upload button handler
    const handleImageBtnClick = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await enqueueImageUpload(file);
            }
        };
        input.click();
    }, [enqueueImageUpload]);

    // Badge styles
    const badgeStyle = {
        saved: { bg: 'rgba(6, 95, 70, 0.95)', color: '#d1fae5', icon: '✓', text: 'Saved' },
        unsaved: { bg: 'rgba(146, 64, 14, 0.95)', color: '#fef3c7', icon: '●', text: 'Unsaved' },
        saving: { bg: 'rgba(30, 64, 175, 0.95)', color: '#dbeafe', icon: '⟳', text: 'Saving...' },
        error: { bg: 'rgba(153, 27, 27, 0.95)', color: '#fecaca', icon: '✗', text: 'Error' },
    };
    const badge = badgeStyle[saveStatus] || badgeStyle.saved;

    if (loading) {
        return (
            <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="mx-auto mb-2 flex justify-center"><Loader className="scale-50" /></div>
                    Loading content...
                </div>
            </div>
        );
    }

    if (!editor) {
        return null;
    }

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontFamily: "'Inter', -apple-system, sans-serif",
            '--md-font-size': `${fontSize}px`,
        }}>
            {/* Toolbar */}
            <div style={{
                height: '50px', display: 'flex', alignItems: 'center', gap: '4px',
                padding: '0 16px', borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', flexShrink: 0,
                zIndex: 10,
            }}>
                <button onClick={handleClose} style={toolBtnStyle} title="Back">
                    <ArrowLeft size={18} />
                </button>
                <div className="h-5 w-px bg-[var(--border-color)] mx-2" />
                <span className="font-semibold text-sm truncate max-w-[200px] mr-4">
                    {file.name}
                </span>

                {/* Editor Actions */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    icon={<Bold size={16} />}
                    title="Bold"
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    icon={<Italic size={16} />}
                    title="Italic"
                />
                <div className="h-4 w-px bg-[var(--border-color)] mx-1" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    icon={<Heading1 size={16} />}
                    title="Heading 1"
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    icon={<Heading2 size={16} />}
                    title="Heading 2"
                />
                <div className="h-4 w-px bg-[var(--border-color)] mx-1" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    icon={<List size={16} />}
                    title="Bullet List"
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    icon={<ListOrdered size={16} />}
                    title="Ordered List"
                />
                <div className="h-4 w-px bg-[var(--border-color)] mx-1" />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    icon={<Quote size={16} />}
                    title="Blockquote"
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive('codeBlock')}
                    icon={<Code size={16} />}
                    title="Code Block"
                />
                <ToolbarButton
                    onClick={handleImageBtnClick}
                    icon={<ImageIcon size={16} />}
                    title="Insert Image"
                />

                <div className="h-4 w-px bg-[var(--border-color)] mx-1" />
                <label className="text-xs text-[var(--text-secondary)]">Text size</label>
                <select
                    value={fontSize}
                    onChange={(e) => {
                        const next = Number(e.target.value);
                        setFontSize(next);
                        localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
                        if (editor) {
                            const markdown = editor.storage.markdown.getMarkdown();
                            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                            saveTimerRef.current = setTimeout(() => saveContent(markdown), 400);
                        }
                    }}
                    className="h-8 px-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs"
                >
                    {[14, 16, 18, 20, 22, 24].map((size) => (<option key={size} value={size}>{size}px</option>))}
                </select>

                <div className="flex-1" />

                {/* Save Status Badge */}
                <button
                    onClick={() => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveContent(editor.storage.markdown.getMarkdown()); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-[var(--bg-secondary)] transition-colors text-xs font-medium"
                    style={{ color: badge.color, background: badge.bg }}
                    title="Save now (Ctrl+S)"
                >
                    <span className="text-[10px]">{badge.icon}</span>
                    {badge.text}
                </button>
            </div>

            {/* Editor Content Area */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-[var(--bg-primary)]">
                <div className="max-w-3xl mx-auto py-8">
                    <EditorContent editor={editor} />
                </div>
            </div>

            <style>{`
                /* Tiptap Editor Styles */
                .ProseMirror {
                    color: var(--text-primary);
                    font-size: var(--md-font-size, 18px);
                    line-height: 1.75;
                }
                .ProseMirror p { margin-bottom: 1.25em; }
                .ProseMirror h1 { font-size: 2.25em; font-weight: 800; margin-top: 1.5em; margin-bottom: 0.8em; line-height: 1.1; }
                .ProseMirror h2 { font-size: 1.75em; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.8em; line-height: 1.3; }
                .ProseMirror h3 { font-size: 1.5em; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.8em; }
                
                .ProseMirror ul { list-style-type: disc; padding-left: 1.6em; margin-bottom: 1.25em; }
                .ProseMirror ol { list-style-type: decimal; padding-left: 1.6em; margin-bottom: 1.25em; }
                
                .ProseMirror blockquote { 
                    border-left: 4px solid var(--accent); 
                    padding-left: 1em; 
                    margin-left: 0; 
                    margin-right: 0; 
                    font-style: italic; 
                    color: var(--text-secondary);
                }
                
                .ProseMirror pre { 
                    background: #1e1e2e; 
                    color: #cdd6f4;
                    padding: 1rem; 
                    border-radius: 0.5rem; 
                    font-family: 'JetBrains Mono', 'Fira Code', monospace; 
                    font-size: 0.9em;
                    overflow-x: auto;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    margin: 1.5em 0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                
                .ProseMirror code { 
                    background: rgba(255,255,255,0.1); 
                    color: #f5c2e7; 
                    padding: 0.2rem 0.4rem; 
                    border-radius: 0.25rem; 
                    font-family: monospace; 
                    font-size: 0.9em;
                }
                
                .ProseMirror pre code { 
                    background: none; 
                    color: inherit; 
                    padding: 0; 
                    font-size: inherit;
                }
                
                .ProseMirror img {
                    border-radius: 8px;
                    max-width: 100%;
                    height: auto;
                    margin: 1.5rem 0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                }
                
                .ProseMirror a {
                    color: var(--accent);
                    text-decoration: underline;
                    cursor: pointer;
                }

                /* Placeholder */
                .ProseMirror p.is-editor-empty:first-child::before {
                    color: #64748b;
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
}

const ToolbarButton = ({ onClick, isActive, icon, title }) => (
    <button
        onClick={onClick}
        title={title}
        className={`
            p-1.5 rounded-md transition-all
            ${isActive
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
            }
        `}
    >
        {icon}
    </button>
);

const toolBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', borderRadius: '6px',
    border: 'none', cursor: 'pointer',
    background: 'transparent', color: 'var(--text-secondary)',
    transition: 'all 0.15s',
};
