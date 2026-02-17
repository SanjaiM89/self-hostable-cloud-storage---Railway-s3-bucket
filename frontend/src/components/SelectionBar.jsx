import React, { useState } from 'react';
import { X, Trash2, FolderInput, Copy, Move, FolderPlus, Clipboard, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SelectionBar({
    selectedCount,
    onClear,
    onDelete,
    onMove,
    onCopy,
    onNewFolderWithSelection,
    onCancelPaste,
    clipboardState,
    onPaste
}) {
    const hasClipboard = clipboardState?.items?.length > 0;
    const hasSelection = selectedCount > 0;

    if (!hasClipboard && !hasSelection) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-3 shadow-2xl backdrop-blur-xl"
            >
                {/* Selection Controls */}
                {hasSelection && (
                    <div className={`flex items-center gap-4 ${hasClipboard ? 'border-r border-[var(--border-color)] pr-4' : ''}`}>
                        <div className="flex items-center gap-3 border-r border-[var(--border-color)] pr-4">
                            <span className="font-semibold text-[var(--text-primary)]">{selectedCount} selected</span>
                            <button
                                onClick={onClear}
                                className="rounded-full p-1 hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onCopy}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors"
                                title="Copy to Clipboard"
                            >
                                <Copy size={18} />
                                <span className="hidden sm:inline">Copy</span>
                            </button>

                            <button
                                onClick={onMove}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors"
                                title="Move to..."
                            >
                                <Move size={18} />
                                <span className="hidden sm:inline">Move</span>
                            </button>

                            <button
                                onClick={onNewFolderWithSelection}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors"
                                title="Group in New Folder"
                            >
                                <FolderPlus size={18} />
                                <span className="hidden sm:inline">Group</span>
                            </button>

                            <button
                                onClick={onDelete}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-500/10 text-[var(--danger)] transition-colors"
                                title="Delete Selected"
                            >
                                <Trash2 size={18} />
                                <span className="hidden sm:inline">Delete</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Clipboard/Paste Controls */}
                {hasClipboard && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 border-r border-[var(--border-color)] pr-4 text-sm font-medium">
                            <span className="text-[var(--text-primary)]">
                                {clipboardState.op === 'move' ? 'Moving' : 'Copying'} {clipboardState.items.length} items
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onPaste}
                                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-[var(--accent-hover)] transition-colors"
                            >
                                <Clipboard size={18} />
                                Paste Here
                            </button>
                            <button
                                onClick={onCancelPaste}
                                className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-red-500/20 transition-colors"
                            >
                                <X size={18} />
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

