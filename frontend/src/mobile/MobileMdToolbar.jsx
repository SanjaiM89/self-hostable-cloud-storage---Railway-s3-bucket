import { useState } from 'react';
import {
    Bold, Italic, Heading1, Heading2, Heading3,
    List, ListOrdered, ListChecks,
    Quote, Code, Image as ImageIcon, Link as LinkIcon,
    Underline as UnderlineIcon, Highlighter,
    Subscript as SubIcon, Superscript as SupIcon,
    Table as TableIcon, Strikethrough, Minus,
    Save, ChevronDown, ChevronUp
} from 'lucide-react';

export default function MobileMdToolbar({ editor, onSave, saveStatus, onImageUpload }) {
    const [expanded, setExpanded] = useState(false);

    if (!editor) return null;

    const btn = (icon, action, isActive = false, title = '') => {
        const Icon = icon;
        return (
            <button
                key={title}
                onClick={action}
                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]'}`}
                title={title}
            >
                <Icon className="w-[18px] h-[18px]" />
            </button>
        );
    };

    const row1 = [
        btn(Bold, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Bold'),
        btn(Italic, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Italic'),
        btn(UnderlineIcon, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Underline'),
        btn(Strikethrough, () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'Strike'),
        btn(Code, () => editor.chain().focus().toggleCode().run(), editor.isActive('code'), 'Code'),
        btn(Highlighter, () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'), 'Highlight'),
    ];

    const row2 = [
        btn(Heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'H1'),
        btn(Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'H2'),
        btn(Heading3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'H3'),
        btn(List, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), 'Bullet List'),
        btn(ListOrdered, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), 'Numbered List'),
        btn(ListChecks, () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'), 'Task List'),
        btn(Quote, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), 'Quote'),
        btn(Minus, () => editor.chain().focus().setHorizontalRule().run(), false, 'Divider'),
        btn(LinkIcon, () => {
            const url = prompt('URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
        }, editor.isActive('link'), 'Link'),
        btn(ImageIcon, onImageUpload, false, 'Image'),
        btn(TableIcon, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, 'Table'),
        btn(SubIcon, () => editor.chain().focus().toggleSubscript().run(), editor.isActive('subscript'), 'Subscript'),
        btn(SupIcon, () => editor.chain().focus().toggleSuperscript().run(), editor.isActive('superscript'), 'Superscript'),
    ];

    return (
        <>
            {/* Toolbar rows */}
            <div className="md-toolbar border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
                {/* Row 1: Always visible, scrollable */}
                <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    {row1}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex-shrink-0 p-2 rounded-lg text-[var(--text-tertiary)] active:bg-[var(--bg-secondary)] ml-auto"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
                {/* Row 2: Expandable */}
                {expanded && (
                    <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto border-t border-[var(--border-color)]" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                        {row2}
                    </div>
                )}
            </div>

            {/* Floating save FAB */}
            <button
                onClick={onSave}
                className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95"
                style={{
                    background: saveStatus === 'saved' ? 'var(--accent)' : '#f59e0b',
                }}
            >
                <Save className="w-6 h-6 text-white" />
            </button>
        </>
    );
}
