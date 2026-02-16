import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
// import { common, createLowlight } from 'lowlight';
// import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { sharesAPI } from '../utils/api';
import { File } from 'lucide-react';
import Loader from './Loader';

// const lowlight = createLowlight(common);
const FONT_SIZE_META_RE = /<!--\s*md-font-size:(\d+)\s*-->/;

function parseMarkdownMeta(markdown = '') {
    const match = markdown.match(FONT_SIZE_META_RE);
    const size = match ? Number(match[1]) : null;
    const clean = markdown.replace(FONT_SIZE_META_RE, '').trimStart();
    return { cleanContent: clean, fontSize: Number.isFinite(size) ? size : 18 };
}

// Custom Image Extension with Width Support (Read-Only)
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
                        style: `width: ${attributes.width}`
                    };
                },
            },
        };
    },
});

export default function MarkdownViewer({ token, fileInfo }) {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fontSize, setFontSize] = useState(18);

    // Tiptap Editor Setup (Read-Only)
    const editor = useEditor({
        editable: false, // Read-only mode
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: true,
            }),
            // CodeBlockLowlight.configure({
            //     lowlight,
            // }),
            Typography,
            CustomImage.configure({
                inline: true,
                allowBase64: true,
            }),
            Markdown.configure({
                html: true, // Allow HTML to support resized images
            }),
        ],
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none px-8 py-6',
            },
        },
    });

    useEffect(() => {
        const loadContent = async () => {
            try {
                setLoading(true);
                const res = await sharesAPI.publicContent(token);
                const text = res.data.content || '';
                const { cleanContent, fontSize: parsedSize } = parseMarkdownMeta(text);
                setFontSize(parsedSize);
                setContent(cleanContent);
                if (editor) {
                    editor.commands.setContent(cleanContent);
                }
            } catch (err) {
                console.error('Failed to load markdown:', err);
                setError('Failed to load document content.');
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, [token, editor]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 text-[var(--text-secondary)]">
                <Loader className="scale-50 mr-2" />
                Loading content...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-12 text-red-400">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-['Inter']" style={{ '--md-font-size': `${fontSize}px` }}>
            {/* Header */}
            <div className="h-14 flex items-center px-6 border-b border-[var(--border-color)] bg-[var(--card-bg)] shrink-0">
                <File className="w-5 h-5 text-[var(--accent)] mr-3" />
                <div>
                    <h1 className="text-sm font-semibold text-[var(--text-primary)]">{fileInfo.name}</h1>
                    <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                        <span>Shared by <strong className="text-[var(--text-primary)]">{fileInfo.shared_by}</strong></span>
                        <span className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                        <span>View Only</span>
                    </div>
                </div>
            </div>

            {/* Viewer */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-[var(--bg-primary)]">
                <div className="max-w-3xl mx-auto py-8">
                    <EditorContent editor={editor} />
                </div>
            </div>

            <style>{`
                /* Tiptap Viewer Styles (Same as Editor but read-only) */
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
            `}</style>
        </div>
    );
}
