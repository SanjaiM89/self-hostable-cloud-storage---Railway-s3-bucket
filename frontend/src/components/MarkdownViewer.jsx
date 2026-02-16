import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
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
import { sharesAPI } from '../utils/api';
import { File } from 'lucide-react';
import Loader from './Loader';

const lowlight = createLowlight(common);
const FONT_SIZE_META_RE = /<!--\s*md-font-size:(\d+)\s*-->/;

function parseMarkdownMeta(markdown = '') {
    const match = markdown.match(FONT_SIZE_META_RE);
    const size = match ? Number(match[1]) : null;
    const clean = markdown.replace(FONT_SIZE_META_RE, '').trimStart();
    return { cleanContent: clean, fontSize: Number.isFinite(size) ? size : 18 };
}

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
        };
    },
});

export default function MarkdownViewer({ token, fileInfo }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fontSize, setFontSize] = useState(18);

    const editor = useEditor({
        editable: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3, 4, 5, 6] },
                codeBlock: false,
                strike: true,
            }),
            CodeBlockLowlight.configure({ lowlight }),
            Link.configure({ openOnClick: true, autolink: true }),
            Underline,
            Highlight.configure({ multicolor: true }),
            Subscript,
            Superscript,
            Table.configure({ resizable: false }),
            TableRow,
            TableCell,
            TableHeader,
            TaskList,
            TaskItem.configure({ nested: true }),
            Typography,
            CustomImage.configure({ inline: true, allowBase64: true }),
            Markdown.configure({ html: true }),
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
                if (editor) editor.commands.setContent(cleanContent);
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
        return <div className="text-center p-12 text-red-400"><p>{error}</p></div>;
    }

    return (
        <div className="h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-['Inter']" style={{ '--md-font-size': `${fontSize}px` }}>
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

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent bg-[var(--bg-primary)]">
                <div className="max-w-3xl mx-auto py-8">
                    <EditorContent editor={editor} />
                </div>
            </div>

            <style>{viewerCSS}</style>
        </div>
    );
}

const viewerCSS = `
    .ProseMirror { color: var(--text-primary); font-size: var(--md-font-size, 18px); line-height: 1.75; }
    .ProseMirror p { margin-bottom: 1.25em; }
    .ProseMirror h1 { font-size: 2.25em; font-weight: 800; margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.1; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.3em; }
    .ProseMirror h2 { font-size: 1.75em; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.2; }
    .ProseMirror h3 { font-size: 1.4em; font-weight: 600; margin-top: 1.4em; margin-bottom: 0.5em; }
    .ProseMirror h4 { font-size: 1.15em; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.5em; }
    .ProseMirror h5 { font-size: 1em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; }
    .ProseMirror h6 { font-size: 0.9em; font-weight: 600; color: var(--text-secondary); }

    .ProseMirror ul { list-style-type: disc; padding-left: 1.6em; margin-bottom: 1.25em; }
    .ProseMirror ol { list-style-type: decimal; padding-left: 1.6em; margin-bottom: 1.25em; }
    .ProseMirror li { margin-bottom: 0.35em; }
    .ProseMirror li p { margin-bottom: 0.25em; }
    .ProseMirror ul ul { list-style-type: circle; }
    .ProseMirror ul ul ul { list-style-type: square; }

    .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
    .ProseMirror ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 4px; }
    .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }
    .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p { text-decoration: line-through; opacity: 0.6; }

    .ProseMirror blockquote { border-left: 4px solid var(--accent); padding: 0.5em 1em; margin: 1em 0; font-style: italic; color: var(--text-secondary); background: rgba(255,255,255,0.02); border-radius: 0 4px 4px 0; }

    .ProseMirror pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.25rem; border-radius: 0.5rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.88em; overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); margin: 1.5em 0; line-height: 1.6; }
    .ProseMirror pre code { background: none; color: inherit; padding: 0; font-size: inherit; border-radius: 0; }
    .ProseMirror .hljs-keyword { color: #cba6f7; }
    .ProseMirror .hljs-string { color: #a6e3a1; }
    .ProseMirror .hljs-number { color: #fab387; }
    .ProseMirror .hljs-function, .ProseMirror .hljs-title { color: #89b4fa; }
    .ProseMirror .hljs-comment { color: #6c7086; font-style: italic; }
    .ProseMirror .hljs-variable { color: #f5c2e7; }
    .ProseMirror .hljs-attr, .ProseMirror .hljs-property { color: #89dceb; }
    .ProseMirror .hljs-type, .ProseMirror .hljs-meta { color: #f9e2af; }
    .ProseMirror .hljs-built_in { color: #f38ba8; }
    .ProseMirror .hljs-operator { color: #94e2d5; }
    .ProseMirror .hljs-addition { color: #a6e3a1; background: rgba(166,227,161,0.1); }
    .ProseMirror .hljs-deletion { color: #f38ba8; background: rgba(243,139,168,0.1); }

    .ProseMirror code { background: rgba(255,255,255,0.1); color: #f5c2e7; padding: 0.15rem 0.4rem; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.88em; border: 1px solid rgba(255,255,255,0.06); }

    .ProseMirror a { color: #89b4fa; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .ProseMirror a:hover { color: #b4d0fb; }

    .ProseMirror table { border-collapse: collapse; width: 100%; margin: 1.5em 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); }
    .ProseMirror th, .ProseMirror td { border: 1px solid rgba(255,255,255,0.1); padding: 0.6rem 0.85rem; text-align: left; vertical-align: top; }
    .ProseMirror th { background: rgba(255,255,255,0.06); font-weight: 600; font-size: 0.93em; }
    .ProseMirror td { background: rgba(255,255,255,0.02); }
    .ProseMirror tr:nth-child(even) td { background: rgba(255,255,255,0.03); }

    .ProseMirror hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 2em 0; }
    .ProseMirror img { border-radius: 8px; max-width: 100%; height: auto; margin: 1.5rem 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .ProseMirror mark { background: rgba(249,226,175,0.35); color: inherit; padding: 0.1em 0.2em; border-radius: 2px; }
    .ProseMirror sub { font-size: 0.75em; }
    .ProseMirror sup { font-size: 0.75em; }
    .ProseMirror s { text-decoration: line-through; opacity: 0.7; }
    .ProseMirror u { text-decoration: underline; text-underline-offset: 3px; }
    .ProseMirror strong { font-weight: 700; }
    .ProseMirror em { font-style: italic; }
`;
