import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { common, createLowlight } from 'lowlight';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { filesAPI } from '../utils/api';
import Loader from './Loader';
import {
    ArrowLeft, Save, Upload as UploadIcon,
    Bold, Italic, Heading1, Heading2, List, ListOrdered,
    Quote, Code, Image as ImageIcon, Link as LinkIcon,
    Undo, Redo
} from 'lucide-react';

// Initialize lowlight with common languages
const lowlight = createLowlight(common);

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
        };
    },
});

export default function MarkdownEditor({ file, onClose }) {
    const [originalContent, setOriginalContent] = useState('');
    const [saveStatus, setSaveStatus] = useState('saved');
    const [loading, setLoading] = useState(true);
    const saveTimerRef = useRef(null);

    // Image upload helper
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

    // Tiptap Editor Setup
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: false, // Disable default codeBlock to use lowlight
            }),
            CodeBlockLowlight.configure({
                lowlight,
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
                html: true, // Allow HTML to support saving resized images
                transformPastedText: true,
                transformCopiedText: true,
                transform: {
                    // Start with default transformation
                    ...Markdown.default?.transform,
                }
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
                        uploadImage(file).then(url => {
                            if (url) {
                                const { schema } = view.state;
                                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                                const node = schema.nodes.image.create({ src: url, alt: file.name });
                                const transaction = view.state.tr.insert(coordinates.pos, node);
                                view.dispatch(transaction);
                            }
                        });
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
                            uploadImage(file).then(url => {
                                if (url) {
                                    const { schema } = view.state;
                                    const node = schema.nodes.image.create({ src: url, alt: file.name || 'Pasted Image' });
                                    const transaction = view.state.tr.replaceSelectionWith(node);
                                    view.dispatch(transaction);
                                }
                            });
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

    // Save content
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
                const res = await filesAPI.getContent(file.id);
                const content = res.data.content || '';
                setOriginalContent(content);
                if (editor) {
                    editor.commands.setContent(content);
                }
            } catch (err) {
                console.error('Failed to load markdown:', err);
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, [file.id, editor]);

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
                const url = await uploadImage(file);
                if (url && editor) {
                    editor.chain().focus().setImage({ src: url, alt: file.name }).run();
                }
            }
        };
        input.click();
    }, [editor, uploadImage]);

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
                    font-size: 1.1rem;
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
                
                /* Boxed Code Blocks */
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
                
                /* Syntax Highlighting Colors (Catppuccin Macchiato inspired) */
                .hljs-comment, .hljs-quote { color: #6c7086; font-style: italic; }
                .hljs-variable, .hljs-template-variable, .hljs-attribute, .hljs-tag, .hljs-name, .hljs-regexp, .hljs-link, .hljs-name, .hljs-selector-id, .hljs-selector-class { color: #f38ba8; }
                .hljs-number, .hljs-meta, .hljs-built_in, .hljs-builtin-name, .hljs-literal, .hljs-type, .hljs-params { color: #fab387; }
                .hljs-string, .hljs-symbol, .hljs-bullet { color: #a6e3a1; }
                .hljs-title, .hljs-section { color: #89b4fa; }
                .hljs-keyword, .hljs-selector-tag { color: #cba6f7; }
                .hljs-emphasis { font-style: italic; }
                .hljs-strong { font-weight: bold; }

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
