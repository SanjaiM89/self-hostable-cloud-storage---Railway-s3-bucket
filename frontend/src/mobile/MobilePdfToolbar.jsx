import { useState, useRef, useEffect } from 'react';
import {
    ZoomIn, ZoomOut, RotateCw, MousePointer2, Highlighter,
    Pencil, Eraser, Search, Printer, Download, ChevronLeft, ChevronRight,
    PanelLeft, X
} from 'lucide-react';

/* Color picker as bottom sheet */
function ColorSheet({ open, onClose, colors, activeColor, onSelect, widths, activeWidth, onWidthSelect, drawColor }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[80]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/30" />
            <div
                className="absolute bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-2xl border-t border-[var(--border-color)] shadow-2xl p-4 pb-8"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideUp 0.2s ease-out', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            >
                <div className="flex justify-center mb-3">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-color)]" />
                </div>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    {colors.map((c) => {
                        const val = typeof c === 'object' ? c.value : c;
                        const name = typeof c === 'object' ? c.name : c;
                        return (
                            <button
                                key={val}
                                onClick={() => { onSelect(val); onClose(); }}
                                className={`w-10 h-10 rounded-full border-2 transition-all ${activeColor === val ? 'border-white scale-110' : 'border-transparent'}`}
                                style={{ background: val }}
                                title={name}
                            />
                        );
                    })}
                </div>
                {widths && (
                    <>
                        <div className="h-px bg-[var(--border-color)] my-3" />
                        <div className="flex items-center justify-center gap-4">
                            {widths.map((w) => (
                                <button
                                    key={w}
                                    onClick={() => onWidthSelect(w)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${activeWidth === w ? 'border-[var(--accent)]' : 'border-[var(--border-color)]'}`}
                                >
                                    <div style={{ width: `${w * 4}px`, height: `${w * 4}px`, borderRadius: '50%', background: drawColor || '#fff' }} />
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function MobilePdfToolbar({
    /* Zoom */
    scale, zoomIn, zoomOut, zoomLevels,
    onScaleChange,
    /* Rotation */
    onRotate,
    /* Tools */
    tool, onToolChange,
    /* Highlight */
    highlightColors, highlightColor, onHighlightColorChange,
    /* Draw */
    drawColors, drawColor, onDrawColorChange,
    drawWidths, drawWidth, onDrawWidthChange,
    /* Navigation */
    currentPage, numPages, onPageChange,
    /* Search */
    searchOpen, onToggleSearch,
    /* Thumbnails */
    showThumbnails, onToggleThumbnails,
    /* Actions */
    onPrint, onDownload, hideDownload,
}) {
    const [hlSheet, setHlSheet] = useState(false);
    const [drawSheet, setDrawSheet] = useState(false);

    return (
        <>
            {/* ═══ Top toolbar — horizontally scrollable ═══ */}
            <div
                className="pdf-toolbar flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] overflow-x-auto"
                style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
                {/* Thumbnail toggle */}
                <button onClick={onToggleThumbnails} className={`pdf-tb flex-shrink-0 ${showThumbnails ? 'pdf-tb-active' : ''}`}>
                    <PanelLeft size={16} />
                </button>

                <div className="pdf-tb-sep flex-shrink-0" />

                {/* Zoom */}
                <button onClick={zoomOut} className="pdf-tb flex-shrink-0"><ZoomOut size={16} /></button>
                <span className="text-[11px] text-[var(--text-secondary)] min-w-[36px] text-center flex-shrink-0">{Math.round(scale * 100)}%</span>
                <button onClick={zoomIn} className="pdf-tb flex-shrink-0"><ZoomIn size={16} /></button>
                <button onClick={onRotate} className="pdf-tb flex-shrink-0"><RotateCw size={16} /></button>

                <div className="pdf-tb-sep flex-shrink-0" />

                {/* Tools */}
                <button onClick={() => onToolChange('select')} className={`pdf-tb flex-shrink-0 ${tool === 'select' ? 'pdf-tb-active' : ''}`}><MousePointer2 size={16} /></button>
                <button onClick={() => { onToolChange('highlight'); setHlSheet(true); }} className={`pdf-tb flex-shrink-0 ${tool === 'highlight' ? 'pdf-tb-active' : ''}`}><Highlighter size={16} /></button>
                <button onClick={() => { onToolChange('draw'); setDrawSheet(true); }} className={`pdf-tb flex-shrink-0 ${tool === 'draw' ? 'pdf-tb-active' : ''}`}><Pencil size={16} /></button>
                <button onClick={() => onToolChange('eraser')} className={`pdf-tb flex-shrink-0 ${tool === 'eraser' ? 'pdf-tb-active' : ''}`}><Eraser size={16} /></button>

                <div className="flex-1 min-w-[8px]" />

                <button onClick={onToggleSearch} className={`pdf-tb flex-shrink-0 ${searchOpen ? 'pdf-tb-active' : ''}`}><Search size={16} /></button>
                {!hideDownload && <button onClick={onPrint} className="pdf-tb flex-shrink-0"><Printer size={16} /></button>}
                {!hideDownload && <button onClick={onDownload} className="pdf-tb flex-shrink-0"><Download size={16} /></button>}
            </div>

            {/* ═══ Bottom page navigation pill ═══ */}
            <div
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--card-bg)] border border-[var(--border-color)] shadow-xl backdrop-blur-lg"
            >
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="p-1 rounded-full text-[var(--text-primary)] disabled:opacity-30"
                >
                    <ChevronLeft size={18} />
                </button>
                <span className="text-[12px] font-medium text-[var(--text-primary)] min-w-[60px] text-center">
                    {currentPage} / {numPages}
                </span>
                <button
                    onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
                    disabled={currentPage >= numPages}
                    className="p-1 rounded-full text-[var(--text-primary)] disabled:opacity-30"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Color sheets */}
            <ColorSheet
                open={hlSheet}
                onClose={() => setHlSheet(false)}
                colors={highlightColors}
                activeColor={highlightColor}
                onSelect={onHighlightColorChange}
            />
            <ColorSheet
                open={drawSheet}
                onClose={() => setDrawSheet(false)}
                colors={drawColors}
                activeColor={drawColor}
                onSelect={onDrawColorChange}
                widths={drawWidths}
                activeWidth={drawWidth}
                onWidthSelect={onDrawWidthChange}
                drawColor={drawColor}
            />

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            `}</style>
        </>
    );
}
