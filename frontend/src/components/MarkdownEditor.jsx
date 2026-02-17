import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { filesAPI } from '../utils/api';
import Loader from './Loader';
import { useMobile, MobileMdToolbar } from '../mobile';
import { useAI } from '../context/AIContext';
import {
    ArrowLeft, Save, Upload as UploadIcon,
    Bold, Italic, Heading1, Heading2, Heading3,
    List, ListOrdered, ListChecks,
    Quote, Code, Image as ImageIcon, Link as LinkIcon,
    Undo, Redo, Underline as UnderlineIcon, Highlighter,
    Subscript as SubIcon, Superscript as SupIcon,
    Table as TableIcon, Strikethrough, Minus
} from 'lucide-react';

// ─── Constants ───
const lowlight = createLowlight(common);
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

// ─── Custom Image Extension ───
const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                renderHTML: attributes => {
                    if (!attributes.width) return {};
                    return { width: attributes.width, style: `width: ${attributes.width}` };
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

// ─── Main Component ───
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
    const editorRef = useRef(null);
    const isMobile = useMobile();

    // ─── 1. Helpers (no editor dependency) ───
    const persistPendingUploads = useCallback(() => {
        localStorage.setItem(PENDING_UPLOAD_STORAGE_KEY, JSON.stringify(Object.values(pendingUploadsRef.current)));
    }, []);

    const fileToDataUrl = useCallback((imgFile) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imgFile);
    }), []);

    // ─── 2. Save Content (needed by useEditor onUpdate) ───
    const saveContent = useCallback(async (text) => {
        setSaveStatus('saving');
        try {
            const contentWithMeta = withMarkdownMeta(text, fontSize);
            try { sessionStorage.setItem(`file_content_${file.id}`, contentWithMeta); } catch (e) { /* quota */ }
            await filesAPI.saveContent(file.id, contentWithMeta);
            localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
            setSaveStatus('saved');
            setOriginalContent(contentWithMeta);
        } catch (err) {
            console.error('Save failed:', err);
            setSaveStatus('error');
        }
    }, [file.id, fontSize]);

    // ─── 3. Image Upload ───
    const uploadImage = useCallback(async (imgFile) => {
        try {
            setSaveStatus('saving');
            const formData = new FormData();
            formData.append('file', imgFile);
            const result = await filesAPI.upload(formData);
            const dlRes = await filesAPI.download(result.data.id);
            return dlRes.data.url;
        } catch (err) {
            console.error('Image upload failed:', err);
            setSaveStatus('error');
            return null;
        }
    }, []);

    // ─── 4. Callbacks using editorRef (breaks TDZ cycle) ───
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
        if (changed) editor.view.dispatch(tr);
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
            editor.view.dispatch(editor.state.tr.insert(insertAtPos, node));
        }

        pendingUploadsRef.current[uploadId] = { id: uploadId, name: imgFile.name, createdAt: Date.now() };
        persistPendingUploads();

        uploadImage(imgFile).then((remoteUrl) => {
            if (remoteUrl) {
                replaceUploadedImage(uploadId, remoteUrl);
                setSaveStatus('unsaved');
                const ed = editorRef.current;
                if (ed) {
                    const markdown = ed.storage.markdown.getMarkdown();
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = setTimeout(() => saveContent(markdown), 700);
                }
            }
        }).finally(() => {
            delete pendingUploadsRef.current[uploadId];
            persistPendingUploads();
        });
    }, [fileToDataUrl, persistPendingUploads, replaceUploadedImage, uploadImage, saveContent]);

    // ─── 5. useEditor Hook (full extension set) ───
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3, 4, 5, 6] },
                codeBlock: false, // replaced by CodeBlockLowlight
                strike: true,
                link: {
                    openOnClick: false,
                    autolink: true,
                    HTMLAttributes: { class: 'editor-link' },
                },
            }),
            CodeBlockLowlight.configure({ lowlight }),
            // Link and Underline are included in StarterKit
            Highlight.configure({ multicolor: true }),
            Subscript,
            Superscript,
            Table.configure({ resizable: true, HTMLAttributes: { class: 'editor-table' } }),
            TableRow,
            TableCell,
            TableHeader,
            TaskList,
            TaskItem.configure({ nested: true }),
            Typography,
            CustomImage.configure({ inline: true, allowBase64: true }),
            Placeholder.configure({ placeholder: 'Start writing or paste content from AI...' }),
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
                if (!moved && event.dataTransfer?.files?.length > 0) {
                    const f = event.dataTransfer.files[0];
                    if (f.type.startsWith('image/')) {
                        event.preventDefault();
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        enqueueImageUpload(f, coordinates?.pos ?? null);
                        return true;
                    }
                }
                return false;
            },
            handlePaste: (view, event) => {
                const items = event.clipboardData?.items;
                if (items) {
                    for (const item of items) {
                        if (item.type.indexOf('image') !== -1) {
                            event.preventDefault();
                            enqueueImageUpload(item.getAsFile());
                            return true;
                        }
                    }
                }
                // Let tiptap handle HTML/text paste natively (supports AI content)
                return false;
            },
        },
        onUpdate: ({ editor }) => {
            setSaveStatus('unsaved');
            const markdown = editor.storage.markdown.getMarkdown();
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => saveContent(markdown), 1500);
        },
    });

    // ... (inside component)

    // ─── 6. Sync editorRef & Register AI Context ───
    const { registerContext } = useAI();

    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    useEffect(() => {
        if (!editor) return;
        const unregister = registerContext(() => ({
            name: file.name,
            type: 'text/markdown',
            content: editor.storage.markdown.getMarkdown()
        }));
        return unregister;
    }, [editor, registerContext, file.name]);

    // ─── Ctrl+S save ───
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

    // ─── Load content ───
    useEffect(() => {
        const loadContent = async () => {
            try {
                setLoading(true);
                const cached = sessionStorage.getItem(`file_content_${file.id}`);
                if (cached) {
                    const { cleanContent, fontSize: metaFontSize } = parseMarkdownMeta(cached);
                    if (metaFontSize) setFontSize(metaFontSize);
                    setOriginalContent(cached);
                    if (editor) editor.commands.setContent(cleanContent);
                    setLoading(false);
                }

                const res = await filesAPI.getContent(file.id);
                const content = res.data.content || '';
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
    }, [file.id, editor]);

    // ─── Close handler ───
    const handleClose = useCallback(async () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (editor) {
            const currentMarkdown = editor.storage.markdown.getMarkdown();
            if (saveStatus === 'unsaved') await saveContent(currentMarkdown);
        }
        onClose();
    }, [editor, saveStatus, saveContent, onClose]);

    // ─── Image upload button ───
    const handleImageBtnClick = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const f = e.target.files[0];
            if (f) await enqueueImageUpload(f);
        };
        input.click();
    }, [enqueueImageUpload]);

    // ─── Link insertion ───
    const handleLinkInsert = useCallback(() => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl || 'https://');
        if (url === null) return;
        if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    // ─── Table insertion ───
    const handleTableInsert = useCallback(() => {
        if (!editor) return;
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }, [editor]);

    // ─── Badge styles ───
    const badge = {
        saved: { bg: 'rgba(6, 95, 70, 0.95)', color: '#d1fae5', icon: '✓', text: 'Saved' },
        unsaved: { bg: 'rgba(146, 64, 14, 0.95)', color: '#fef3c7', icon: '●', text: 'Unsaved' },
        saving: { bg: 'rgba(30, 64, 175, 0.95)', color: '#dbeafe', icon: '⟳', text: 'Saving...' },
        error: { bg: 'rgba(153, 27, 27, 0.95)', color: '#fecaca', icon: '✗', text: 'Error' },
    }[saveStatus] || { bg: 'rgba(6, 95, 70, 0.95)', color: '#d1fae5', icon: '✓', text: 'Saved' };

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="mx-auto mb-2 flex justify-center"><Loader className="scale-50" /></div>
                    Loading content...
                </div>
            </div>
        );
    }

    if (!editor) return null;

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            fontFamily: "'Inter', -apple-system, sans-serif",
            '--md-font-size': `${fontSize}px`,
        }}>
            {/* ─── Toolbar ─── */}
            {/* ─── Toolbar ─── */}
            {isMobile ? (
                <MobileMdToolbar
                    editor={editor}
                    onSave={() => editor && saveContent(editor.storage.markdown.getMarkdown())}
                    saveStatus={saveStatus}
                    onImageUpload={() => document.getElementById('md-image-upload').click()}
                />
            ) : (
                <div className="editor-toolbar">
                    <button onClick={handleClose} style={toolBtnStyle} title="Back"><ArrowLeft size={18} /></button>
                    <div className="toolbar-sep" />
                    <span className="font-semibold text-sm truncate max-w-[160px] mr-3">{file.name}</span>

                    {/* Text Formatting */}
                    <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold size={15} />} title="Bold" />
                    <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic size={15} />} title="Italic" />
                    <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon size={15} />} title="Underline" />
                    <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} icon={<Strikethrough size={15} />} title="Strikethrough" />
                    <TBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter size={15} />} title="Highlight" />
                    <TBtn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} icon={<SubIcon size={15} />} title="Subscript (x₂)" />
                    <TBtn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} icon={<SupIcon size={15} />} title="Superscript (x²)" />

                    <div className="toolbar-sep" />

                    {/* Headings */}
                    <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={<Heading1 size={15} />} title="Heading 1" />
                    <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={<Heading2 size={15} />} title="Heading 2" />
                    <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={<Heading3 size={15} />} title="Heading 3" />

                    <div className="toolbar-sep" />

                    {/* Lists & Blocks */}
                    <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={<List size={15} />} title="Bullet List" />
                    <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={<ListOrdered size={15} />} title="Numbered List" />
                    <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} icon={<ListChecks size={15} />} title="Task List (Checkboxes)" />
                    <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={<Quote size={15} />} title="Blockquote" />
                    <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} icon={<Code size={15} />} title="Code Block" />
                    <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={<Minus size={15} />} title="Horizontal Rule" />

                    <div className="toolbar-sep" />

                    {/* Rich Content */}
                    <TBtn onClick={handleLinkInsert} active={editor.isActive('link')} icon={<LinkIcon size={15} />} title="Insert Link" />
                    <TBtn onClick={handleImageBtnClick} icon={<ImageIcon size={15} />} title="Insert Image" />
                    <TBtn onClick={handleTableInsert} icon={<TableIcon size={15} />} title="Insert Table (3×3)" />

                    <div className="toolbar-sep" />

                    {/* Text Size */}
                    <label className="text-xs text-[var(--text-secondary)] whitespace-nowrap">Size</label>
                    <select value={fontSize} onChange={(e) => {
                        const next = Number(e.target.value);
                        setFontSize(next);
                        localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
                        if (editor) {
                            const md = editor.storage.markdown.getMarkdown();
                            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                            saveTimerRef.current = setTimeout(() => saveContent(md), 400);
                        }
                    }} className="h-7 px-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs">
                        {[14, 16, 18, 20, 22, 24].map(s => <option key={s} value={s}>{s}px</option>)}
                    </select>

                    <div className="flex-1" />

                    {/* Undo/Redo */}
                    <TBtn onClick={() => editor.chain().focus().undo().run()} icon={<Undo size={15} />} title="Undo" />
                    <TBtn onClick={() => editor.chain().focus().redo().run()} icon={<Redo size={15} />} title="Redo" />

                    {/* Save Badge */}
                    <button
                        onClick={() => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveContent(editor.storage.markdown.getMarkdown()); }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium ml-2"
                        style={{ color: badge.color, background: badge.bg }}
                        title="Save now (Ctrl+S)"
                    >
                        <span className="text-[10px]">{badge.icon}</span>{badge.text}
                    </button>
                </div>
            )}

            {/* ─── Editor Content ─── */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-[var(--bg-primary)]">
                <div className="max-w-3xl mx-auto py-8">
                    <EditorContent editor={editor} />
                </div>
            </div>

            {/* ─── Editor Styles ─── */}
            <style>{editorCSS}</style>
        </div>
    );
}

// ─── Toolbar Button Component ───
const TBtn = ({ onClick, active, icon, title }) => (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-md transition-all ${active ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}`}>
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

// ─── Comprehensive Editor CSS ───
const editorCSS = `
    .editor-toolbar {
        height: 50px; display: flex; align-items: center; gap: 3px;
        padding: 0 12px; border-bottom: 1px solid var(--border-color);
        background: var(--bg-primary); flex-shrink: 0; z-index: 10;
        overflow-x: auto;
    }
    .toolbar-sep { width: 1px; height: 18px; background: var(--border-color); margin: 0 4px; flex-shrink: 0; }

    /* ─── Base ─── */
    .ProseMirror { color: var(--text-primary); font-size: var(--md-font-size, 18px); line-height: 1.75; }
    .ProseMirror:focus { outline: none; }
    .ProseMirror p { margin-bottom: 1.25em; }

    /* ─── Headings ─── */
    .ProseMirror h1 { font-size: 2.25em; font-weight: 800; margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.1; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.3em; }
    .ProseMirror h2 { font-size: 1.75em; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.2; }
    .ProseMirror h3 { font-size: 1.4em; font-weight: 600; margin-top: 1.4em; margin-bottom: 0.5em; }
    .ProseMirror h4 { font-size: 1.15em; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.5em; }
    .ProseMirror h5 { font-size: 1em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; }
    .ProseMirror h6 { font-size: 0.9em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; color: var(--text-secondary); }

    /* ─── Lists ─── */
    .ProseMirror ul { list-style-type: disc; padding-left: 1.6em; margin-bottom: 1.25em; }
    .ProseMirror ol { list-style-type: decimal; padding-left: 1.6em; margin-bottom: 1.25em; }
    .ProseMirror li { margin-bottom: 0.35em; }
    .ProseMirror li p { margin-bottom: 0.25em; }
    .ProseMirror ul ul { list-style-type: circle; }
    .ProseMirror ul ul ul { list-style-type: square; }

    /* ─── Task List (Checkboxes) ─── */
    .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
    .ProseMirror ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 4px; }
    .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
        width: 16px; height: 16px; accent-color: var(--accent);
        cursor: pointer; border-radius: 4px;
    }
    .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p { text-decoration: line-through; opacity: 0.6; }

    /* ─── Blockquote ─── */
    .ProseMirror blockquote {
        border-left: 4px solid var(--accent);
        padding-left: 1em; margin-left: 0; margin-right: 0;
        font-style: italic; color: var(--text-secondary);
        background: rgba(255,255,255,0.02); border-radius: 0 4px 4px 0;
        padding: 0.5em 1em; margin: 1em 0;
    }

    /* ─── Code Block (Syntax Highlighted) ─── */
    .ProseMirror pre {
        background: #1e1e2e; color: #cdd6f4;
        padding: 1rem 1.25rem; border-radius: 0.5rem;
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 0.88em; overflow-x: auto;
        border: 1px solid rgba(255, 255, 255, 0.08);
        margin: 1.5em 0;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
        line-height: 1.6;
    }
    .ProseMirror pre code { background: none; color: inherit; padding: 0; font-size: inherit; border-radius: 0; }

    /* Lowlight / Syntax Highlighting Colors (Catppuccin Mocha) */
    .ProseMirror .hljs-keyword { color: #cba6f7; }
    .ProseMirror .hljs-string { color: #a6e3a1; }
    .ProseMirror .hljs-number { color: #fab387; }
    .ProseMirror .hljs-function { color: #89b4fa; }
    .ProseMirror .hljs-title { color: #89b4fa; }
    .ProseMirror .hljs-comment { color: #6c7086; font-style: italic; }
    .ProseMirror .hljs-variable { color: #f5c2e7; }
    .ProseMirror .hljs-attr { color: #89dceb; }
    .ProseMirror .hljs-type { color: #f9e2af; }
    .ProseMirror .hljs-built_in { color: #f38ba8; }
    .ProseMirror .hljs-params { color: #f2cdcd; }
    .ProseMirror .hljs-literal { color: #fab387; }
    .ProseMirror .hljs-symbol { color: #f5c2e7; }
    .ProseMirror .hljs-meta { color: #f9e2af; }
    .ProseMirror .hljs-operator { color: #94e2d5; }
    .ProseMirror .hljs-punctuation { color: #bac2de; }
    .ProseMirror .hljs-property { color: #89dceb; }
    .ProseMirror .hljs-regexp { color: #f38ba8; }
    .ProseMirror .hljs-selector-tag { color: #cba6f7; }
    .ProseMirror .hljs-selector-class { color: #a6e3a1; }
    .ProseMirror .hljs-selector-id { color: #89b4fa; }
    .ProseMirror .hljs-tag { color: #cba6f7; }
    .ProseMirror .hljs-name { color: #cba6f7; }
    .ProseMirror .hljs-addition { color: #a6e3a1; background: rgba(166,227,161,0.1); }
    .ProseMirror .hljs-deletion { color: #f38ba8; background: rgba(243,139,168,0.1); }

    /* ─── Inline Code ─── */
    .ProseMirror code {
        background: rgba(255,255,255,0.1);
        color: #f5c2e7; padding: 0.15rem 0.4rem;
        border-radius: 4px; font-family: 'JetBrains Mono', monospace;
        font-size: 0.88em; border: 1px solid rgba(255,255,255,0.06);
    }

    /* ─── Links ─── */
    .ProseMirror a, .ProseMirror a.editor-link {
        color: #89b4fa; text-decoration: underline;
        text-underline-offset: 3px; cursor: pointer;
        transition: color 0.15s;
    }
    .ProseMirror a:hover { color: #b4d0fb; }

    /* ─── Tables ─── */
    .ProseMirror table {
        border-collapse: collapse; width: 100%;
        margin: 1.5em 0; overflow: hidden;
        border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
    }
    .ProseMirror th, .ProseMirror td {
        border: 1px solid rgba(255,255,255,0.1);
        padding: 0.6rem 0.85rem; text-align: left;
        vertical-align: top; min-width: 80px;
        position: relative;
    }
    .ProseMirror th {
        background: rgba(255,255,255,0.06);
        font-weight: 600; font-size: 0.93em;
        color: var(--text-primary);
    }
    .ProseMirror td { background: rgba(255,255,255,0.02); }
    .ProseMirror tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
    .ProseMirror .selectedCell { background: rgba(137, 180, 250, 0.15) !important; }
    .ProseMirror .column-resize-handle {
        position: absolute; right: -2px; top: 0; bottom: -2px;
        width: 4px; background: var(--accent); pointer-events: none;
    }
    .ProseMirror .tableWrapper { overflow-x: auto; margin: 1.5em 0; }

    /* ─── Horizontal Rule ─── */
    .ProseMirror hr {
        border: none; border-top: 1px solid rgba(255,255,255,0.12);
        margin: 2em 0;
    }

    /* ─── Images ─── */
    .ProseMirror img {
        border-radius: 8px; max-width: 100%; height: auto;
        margin: 1.5rem 0;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
    }

    /* ─── Marks ─── */
    .ProseMirror mark { background: rgba(249, 226, 175, 0.35); color: inherit; padding: 0.1em 0.2em; border-radius: 2px; }
    .ProseMirror sub { font-size: 0.75em; }
    .ProseMirror sup { font-size: 0.75em; }
    .ProseMirror s { text-decoration: line-through; opacity: 0.7; }
    .ProseMirror u { text-decoration: underline; text-underline-offset: 3px; }
    .ProseMirror strong { font-weight: 700; }
    .ProseMirror em { font-style: italic; }

    /* ─── Placeholder ─── */
    .ProseMirror p.is-editor-empty:first-child::before {
        color: #64748b; content: attr(data-placeholder);
        float: left; height: 0; pointer-events: none;
    }

    /* ─── Selection ─── */
    .ProseMirror ::selection { background: rgba(137, 180, 250, 0.25); }
`;
