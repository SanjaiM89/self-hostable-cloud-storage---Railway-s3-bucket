import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
    ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    ZoomIn, ZoomOut, Search, Printer, Download, PanelLeft,
    MousePointer2, Highlighter, Pencil, Eraser, X,
    Minus, Plus, RotateCw, Columns2
} from 'lucide-react';
import Loader from './Loader';
import { useMobile, MobilePdfToolbar } from '../mobile';

// ─── PDF.js Worker ───
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ─── Constants ───
const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];
const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: 'rgba(255, 235, 59, 0.4)' },
    { name: 'Green', value: 'rgba(76, 175, 80, 0.4)' },
    { name: 'Blue', value: 'rgba(33, 150, 243, 0.4)' },
    { name: 'Pink', value: 'rgba(233, 30, 99, 0.4)' },
];
const DRAW_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#000000'];
const DRAW_WIDTHS = [1, 2, 3, 5, 8];

// ─── PDF Viewer Component ───
export default function PdfViewer({ file, fileUrl, onClose, hideDownload = false }) {
    const [numPages, setNumPages] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [rotation, setRotation] = useState(0);
    const [tool, setTool] = useState('select');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pageSize, setPageSize] = useState({ width: 612, height: 792 });

    // Drawing
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawWidth, setDrawWidth] = useState(2);
    const [isDrawing, setIsDrawing] = useState(false);
    const [pageDrawings, setPageDrawings] = useState({});
    const currentPathRef = useRef(null);
    const [, forceRender] = useState(0);

    // Highlights
    const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
    const [pageHighlights, setPageHighlights] = useState({});

    // Search
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchIndex, setSearchIndex] = useState(0);

    // Tool color pickers
    const [showDrawColors, setShowDrawColors] = useState(false);
    const [showHighlightColors, setShowHighlightColors] = useState(false);

    // Refs
    const viewerRef = useRef(null);
    const pdfDocRef = useRef(null);
    const pageElementsRef = useRef({});
    const isMobile = useMobile();

    // ─── Document Load ───
    const onDocumentLoadSuccess = useCallback(async (pdf) => {
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        try {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            setPageSize({ width: viewport.width, height: viewport.height });
        } catch (e) { /* fallback to default */ }
        setLoading(false);
    }, []);

    // ─── Scroll tracking → currentPage ───
    useEffect(() => {
        const container = viewerRef.current;
        if (!container || !numPages) return;
        const handleScroll = () => {
            const containerRect = container.getBoundingClientRect();
            const mid = containerRect.top + containerRect.height / 2;
            let best = 1;
            let bestDist = Infinity;
            for (let p = 1; p <= numPages; p++) {
                const el = pageElementsRef.current[p];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                const pageMid = rect.top + rect.height / 2;
                const dist = Math.abs(pageMid - mid);
                if (dist < bestDist) { bestDist = dist; best = p; }
            }
            setCurrentPage(best);
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [numPages]);

    // ─── Navigation ───
    const scrollToPage = useCallback((p) => {
        const el = pageElementsRef.current[p];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const goToPage = useCallback((p) => {
        const page = Math.max(1, Math.min(p, numPages || 1));
        setCurrentPage(page);
        scrollToPage(page);
    }, [numPages, scrollToPage]);

    // ─── Zoom ───
    const zoomIn = () => {
        const next = ZOOM_LEVELS.find(z => z > scale) || scale;
        setScale(next);
    };
    const zoomOut = () => {
        const next = [...ZOOM_LEVELS].reverse().find(z => z < scale) || scale;
        setScale(next);
    };

    // ─── Drawing Handlers ───
    const getSVGPoint = (svg, e) => {
        const pt = svg.createSVGPoint();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        pt.x = clientX;
        pt.y = clientY;
        const ctm = svg.getScreenCTM()?.inverse();
        if (!ctm) return { x: 0, y: 0 };
        const svgPt = pt.matrixTransform(ctm);
        return { x: svgPt.x, y: svgPt.y };
    };

    const handleDrawStart = (e, pageNum) => {
        if (tool === 'eraser') {
            handleErase(e, pageNum);
            return;
        }
        if (tool !== 'draw') return;
        e.preventDefault();
        const svg = e.currentTarget;
        const point = getSVGPoint(svg, e);
        setIsDrawing(true);
        currentPathRef.current = { pageNum, points: [point], color: drawColor, width: drawWidth };
        forceRender(n => n + 1);
    };

    const handleDrawMove = (e, pageNum) => {
        if (!isDrawing || !currentPathRef.current || tool !== 'draw') return;
        e.preventDefault();
        const svg = e.currentTarget;
        const point = getSVGPoint(svg, e);
        currentPathRef.current.points.push(point);
        forceRender(n => n + 1);
    };

    const handleDrawEnd = () => {
        if (!isDrawing || !currentPathRef.current) { setIsDrawing(false); return; }
        const { pageNum, points, color, width } = currentPathRef.current;
        if (points.length > 1) {
            setPageDrawings(prev => ({
                ...prev,
                [pageNum]: [...(prev[pageNum] || []), { points, color, width }],
            }));
        }
        currentPathRef.current = null;
        setIsDrawing(false);
    };

    // ─── Eraser ───
    const handleErase = (e, pageNum) => {
        const svg = e.currentTarget;
        const pt = getSVGPoint(svg, e);
        const threshold = 10;
        setPageDrawings(prev => {
            const drawings = prev[pageNum] || [];
            const filtered = drawings.filter(d =>
                !d.points.some(p => Math.hypot(p.x - pt.x, p.y - pt.y) < threshold)
            );
            return { ...prev, [pageNum]: filtered };
        });
        setPageHighlights(prev => {
            const highlights = prev[pageNum] || [];
            const filtered = highlights.filter(h =>
                !h.rects.some(r => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h)
            );
            return { ...prev, [pageNum]: filtered };
        });
    };

    // ─── Highlight (on text selection) ───
    const handleTextSelect = useCallback((pageNum) => {
        if (tool !== 'highlight') return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rects = Array.from(range.getClientRects());
        if (rects.length === 0) return;

        const svg = document.getElementById(`pdf-draw-layer-${pageNum}`);
        if (!svg) return;

        const ctm = svg.getScreenCTM()?.inverse();
        if (!ctm) return;

        const normalizedRects = rects.map(rect => {
            const pt1 = svg.createSVGPoint();
            pt1.x = rect.left; pt1.y = rect.top;
            const s1 = pt1.matrixTransform(ctm);
            const pt2 = svg.createSVGPoint();
            pt2.x = rect.right; pt2.y = rect.bottom;
            const s2 = pt2.matrixTransform(ctm);
            return { x: s1.x, y: s1.y, w: s2.x - s1.x, h: s2.y - s1.y };
        }).filter(r => r.w > 0 && r.h > 0);

        if (normalizedRects.length > 0) {
            setPageHighlights(prev => ({
                ...prev,
                [pageNum]: [...(prev[pageNum] || []), { rects: normalizedRects, color: highlightColor }],
            }));
        }
        selection.removeAllRanges();
    }, [tool, highlightColor]);

    // ─── Search ───
    const handleSearch = useCallback(async () => {
        if (!pdfDocRef.current || !searchText.trim()) { setSearchResults([]); return; }
        const results = [];
        for (let i = 1; i <= numPages; i++) {
            const page = await pdfDocRef.current.getPage(i);
            const tc = await page.getTextContent();
            const text = tc.items.map(item => item.str).join(' ');
            if (text.toLowerCase().includes(searchText.toLowerCase())) results.push(i);
        }
        setSearchResults(results);
        setSearchIndex(0);
        if (results.length > 0) scrollToPage(results[0]);
    }, [searchText, numPages, scrollToPage]);

    useEffect(() => {
        if (!searchText) { setSearchResults([]); return; }
        const timer = setTimeout(handleSearch, 400);
        return () => clearTimeout(timer);
    }, [searchText, handleSearch]);

    // ─── Print ───
    const handlePrint = () => { window.open(fileUrl, '_blank'); };

    // ─── Download ───
    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = file.name || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // ─── Keyboard + wheel shortcuts ───
    useEffect(() => {
        const handler = (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'f') { e.preventDefault(); setSearchOpen(true); }
                if (e.key === 'p') { e.preventDefault(); handlePrint(); }
                if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
                if (e.key === '-') { e.preventDefault(); zoomOut(); }
                if (e.key === ' ') { e.preventDefault(); setScale(1.0); }
            }
            if (e.key === 'Escape') { setSearchOpen(false); setShowDrawColors(false); setShowHighlightColors(false); }
        };
        const wheelHandler = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.deltaY < 0) zoomIn();
                else if (e.deltaY > 0) zoomOut();
            }
        };
        window.addEventListener('keydown', handler);
        const viewer = viewerRef.current;
        if (viewer) viewer.addEventListener('wheel', wheelHandler, { passive: false });
        return () => {
            window.removeEventListener('keydown', handler);
            if (viewer) viewer.removeEventListener('wheel', wheelHandler);
        };
    }, [scale]);

    // ─── Path helper ───
    const pointsToD = (points) => {
        if (!points || points.length === 0) return '';
        return `M ${points[0].x},${points[0].y} ${points.slice(1).map(p => `L ${p.x},${p.y}`).join(' ')}`;
    };

    // ─── Render helpers ───
    const toolCursor = tool === 'draw' ? 'crosshair' : tool === 'eraser' ? 'pointer' : tool === 'highlight' ? 'text' : 'default';

    if (error) {
        return (
            <div className="h-full flex items-center justify-center bg-[var(--bg-primary)]">
                <div className="text-center">
                    <p className="text-red-400 text-lg mb-4">Failed to load PDF</p>
                    <p className="text-[var(--text-secondary)] text-sm mb-4">{error}</p>
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="pdf-viewer h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ═══ Toolbar ═══ */}
            {/* ═══ Toolbar ═══ */}
            {isMobile ? (
                <MobilePdfToolbar
                    scale={scale}
                    zoomIn={zoomIn}
                    zoomOut={zoomOut}
                    zoomLevels={ZOOM_LEVELS}
                    onScaleChange={setScale}
                    onRotate={() => setRotation(r => (r + 90) % 360)}
                    tool={tool}
                    onToolChange={setTool}
                    highlightColors={HIGHLIGHT_COLORS}
                    highlightColor={highlightColor}
                    onHighlightColorChange={setHighlightColor}
                    drawColors={DRAW_COLORS}
                    drawColor={drawColor}
                    onDrawColorChange={setDrawColor}
                    drawWidths={DRAW_WIDTHS}
                    drawWidth={drawWidth}
                    onDrawWidthChange={setDrawWidth}
                    currentPage={currentPage}
                    numPages={numPages}
                    onPageChange={goToPage}
                    searchOpen={searchOpen}
                    onToggleSearch={() => setSearchOpen(!searchOpen)}
                    showThumbnails={sidebarOpen}
                    onToggleThumbnails={() => setSidebarOpen(!sidebarOpen)}
                    onPrint={() => window.print()}
                    onDownload={handleDownload}
                    hideDownload={hideDownload}
                />
            ) : (
                <div className="pdf-toolbar">
                    {/* Left: Nav */}
                    <button onClick={onClose} className="pdf-tb" title="Close"><ArrowLeft size={18} /></button>
                    <div className="pdf-tb-sep" />
                    <button onClick={() => setSidebarOpen(v => !v)} className={`pdf-tb ${sidebarOpen ? 'pdf-tb-active' : ''}`} title="Toggle Thumbnails"><PanelLeft size={16} /></button>
                    <div className="pdf-tb-sep" />

                    <button onClick={() => goToPage(1)} className="pdf-tb" title="First Page" disabled={currentPage <= 1}><ChevronsLeft size={16} /></button>
                    <button onClick={() => goToPage(currentPage - 1)} className="pdf-tb" title="Previous" disabled={currentPage <= 1}><ChevronLeft size={16} /></button>
                    <div className="flex items-center gap-1 mx-1">
                        <input
                            type="number" min={1} max={numPages || 1} value={currentPage}
                            onChange={e => goToPage(Number(e.target.value))}
                            className="w-12 h-7 text-center rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs"
                        />
                        <span className="text-xs text-[var(--text-secondary)]">of {numPages || '?'}</span>
                    </div>
                    <button onClick={() => goToPage(currentPage + 1)} className="pdf-tb" title="Next" disabled={currentPage >= numPages}><ChevronRight size={16} /></button>
                    <button onClick={() => goToPage(numPages)} className="pdf-tb" title="Last Page" disabled={currentPage >= numPages}><ChevronsRight size={16} /></button>

                    <div className="pdf-tb-sep" />

                    {/* Zoom */}
                    <button onClick={zoomOut} className="pdf-tb" title="Zoom Out"><Minus size={16} /></button>
                    <select value={scale} onChange={e => setScale(Number(e.target.value))} className="h-7 px-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs">
                        {ZOOM_LEVELS.map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
                    </select>
                    <button onClick={zoomIn} className="pdf-tb" title="Zoom In"><Plus size={16} /></button>
                    <button onClick={() => setRotation(r => (r + 90) % 360)} className="pdf-tb" title="Rotate"><RotateCw size={16} /></button>

                    <div className="pdf-tb-sep" />

                    {/* Tools */}
                    <button onClick={() => setTool('select')} className={`pdf-tb ${tool === 'select' ? 'pdf-tb-active' : ''}`} title="Select"><MousePointer2 size={16} /></button>

                    <div className="relative">
                        <button onClick={() => { setTool('highlight'); setShowHighlightColors(v => !v); setShowDrawColors(false); }} className={`pdf-tb ${tool === 'highlight' ? 'pdf-tb-active' : ''}`} title="Highlight Text">
                            <Highlighter size={16} />
                        </button>
                        {showHighlightColors && (
                            <div className="pdf-color-picker">
                                {HIGHLIGHT_COLORS.map(c => (
                                    <button key={c.value} onClick={() => { setHighlightColor(c.value); setShowHighlightColors(false); }}
                                        className={`pdf-color-dot ${highlightColor === c.value ? 'ring-2 ring-white' : ''}`}
                                        style={{ background: c.value }} title={c.name} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button onClick={() => { setTool('draw'); setShowDrawColors(v => !v); setShowHighlightColors(false); }} className={`pdf-tb ${tool === 'draw' ? 'pdf-tb-active' : ''}`} title="Draw">
                            <Pencil size={16} />
                        </button>
                        {showDrawColors && (
                            <div className="pdf-color-picker">
                                {DRAW_COLORS.map(c => (
                                    <button key={c} onClick={() => { setDrawColor(c); setShowDrawColors(false); }}
                                        className={`pdf-color-dot ${drawColor === c ? 'ring-2 ring-white' : ''}`}
                                        style={{ background: c }} />
                                ))}
                                <div className="pdf-tb-sep-h" />
                                {DRAW_WIDTHS.map(w => (
                                    <button key={w} onClick={() => setDrawWidth(w)}
                                        className={`pdf-width-dot ${drawWidth === w ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                                        <div style={{ width: `${w * 3}px`, height: `${w * 3}px`, borderRadius: '50%', background: drawColor }} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={() => setTool('eraser')} className={`pdf-tb ${tool === 'eraser' ? 'pdf-tb-active' : ''}`} title="Eraser"><Eraser size={16} /></button>

                    <div className="flex-1" />

                    {/* Right actions */}
                    <button onClick={() => setSearchOpen(v => !v)} className={`pdf-tb ${searchOpen ? 'pdf-tb-active' : ''}`} title="Search (Ctrl+F)"><Search size={16} /></button>
                    {!hideDownload && <button onClick={handlePrint} className="pdf-tb" title="Print"><Printer size={16} /></button>}
                    {!hideDownload && <button onClick={handleDownload} className="pdf-tb" title="Download"><Download size={16} /></button>}
                </div>
            )}

            {/* ═══ Search bar ═══ */}
            {searchOpen && (
                <div className="pdf-search-bar">
                    <Search size={14} className="text-[var(--text-secondary)]" />
                    <input
                        type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                        placeholder="Search in document..."
                        className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none"
                        autoFocus
                    />
                    {searchResults.length > 0 && (
                        <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                            {searchIndex + 1} of {searchResults.length} pages
                            <button onClick={() => { const i = (searchIndex + 1) % searchResults.length; setSearchIndex(i); scrollToPage(searchResults[i]); }} className="ml-1 pdf-tb p-0.5"><ChevronRight size={14} /></button>
                        </span>
                    )}
                    <button onClick={() => { setSearchOpen(false); setSearchText(''); setSearchResults([]); }} className="pdf-tb p-1"><X size={14} /></button>
                </div>
            )}

            {/* ═══ Body ═══ */}
            <div className="flex flex-1 overflow-hidden">

                {/* ─── Sidebar: Thumbnails ─── */}
                <div
                    className={`pdf-thumb-sidebar w-[200px] border-r border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-y-auto flex-shrink-0 transition-all duration-300 ${!sidebarOpen ? '-ml-[200px]' : ''} ${isMobile && sidebarOpen ? 'mobile-visible shadow-2xl' : ''}`}
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
                        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Pages</span>
                        <button onClick={() => setSidebarOpen(false)} className="pdf-tb p-0.5"><X size={14} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                        {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map(p => (
                            <button key={p} onClick={() => goToPage(p)}
                                className={`pdf-thumb ${currentPage === p ? 'pdf-thumb-active' : ''}`}>
                                <Document file={fileUrl} loading="">
                                    <Page pageNumber={p} width={130} renderTextLayer={false} renderAnnotationLayer={false} />
                                </Document>
                                <span className="text-[10px] text-[var(--text-secondary)] mt-1">{p}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Main Viewer ─── */}
                <div ref={viewerRef} className="pdf-main-viewer" style={{ cursor: toolCursor }}>
                    {loading && (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <Loader className="scale-50 mb-2 mx-auto" />
                                <span className="text-sm text-[var(--text-secondary)]">Loading PDF...</span>
                            </div>
                        </div>
                    )}

                    <Document
                        file={fileUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(err) => { setLoading(false); setError(err.message); }}
                        loading=""
                    >
                        {numPages && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                            <div
                                key={pageNum}
                                ref={el => { pageElementsRef.current[pageNum] = el; }}
                                className="pdf-page-wrapper"
                            >
                                <Page
                                    pageNumber={pageNum}
                                    scale={scale}
                                    rotate={rotation}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                    loading=""
                                />

                                {/* SVG Drawing + Highlight overlay */}
                                <svg
                                    id={`pdf-draw-layer-${pageNum}`}
                                    className="pdf-draw-layer"
                                    viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                                    preserveAspectRatio="none"
                                    onMouseDown={(e) => handleDrawStart(e, pageNum)}
                                    onMouseMove={(e) => handleDrawMove(e, pageNum)}
                                    onMouseUp={() => { handleDrawEnd(); handleTextSelect(pageNum); }}
                                    onMouseLeave={handleDrawEnd}
                                    onTouchStart={(e) => handleDrawStart(e, pageNum)}
                                    onTouchMove={(e) => handleDrawMove(e, pageNum)}
                                    onTouchEnd={() => { handleDrawEnd(); handleTextSelect(pageNum); }}
                                    style={{ pointerEvents: tool === 'select' ? 'none' : 'auto' }}
                                >
                                    {/* Saved highlights */}
                                    {(pageHighlights[pageNum] || []).map((h, i) =>
                                        h.rects.map((r, j) => (
                                            <rect key={`h-${i}-${j}`} x={r.x} y={r.y} width={r.w} height={r.h}
                                                fill={h.color} rx="2" />
                                        ))
                                    )}
                                    {/* Saved drawings */}
                                    {(pageDrawings[pageNum] || []).map((d, i) => (
                                        <path key={`d-${i}`} d={pointsToD(d.points)} stroke={d.color}
                                            strokeWidth={d.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    ))}
                                    {/* Active drawing */}
                                    {isDrawing && currentPathRef.current?.pageNum === pageNum && (
                                        <path d={pointsToD(currentPathRef.current.points)}
                                            stroke={currentPathRef.current.color}
                                            strokeWidth={currentPathRef.current.width}
                                            fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                                    )}
                                </svg>

                                <div className="pdf-page-number">{pageNum}</div>
                            </div>
                        ))}
                    </Document>
                </div>
            </div>

            <style>{pdfViewerCSS}</style>
        </div>
    );
}

// ─── Styles ───
const pdfViewerCSS = `
    /* ═══ Toolbar ═══ */
    .pdf-toolbar {
        height: 44px; display: flex; align-items: center; gap: 2px;
        padding: 0 10px; border-bottom: 1px solid var(--border-color);
        background: var(--card-bg); flex-shrink: 0; z-index: 20;
    }
    .pdf-tb {
        display: flex; align-items: center; justify-content: center;
        width: 30px; height: 30px; border-radius: 6px; border: none;
        background: transparent; color: var(--text-secondary);
        cursor: pointer; transition: all 0.15s; flex-shrink: 0;
    }
    .pdf-tb:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .pdf-tb:disabled { opacity: 0.3; cursor: not-allowed; }
    .pdf-tb-active { background: var(--accent) !important; color: white !important; }
    .pdf-tb-sep { width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; flex-shrink: 0; }
    .pdf-tb-sep-h { width: 100%; height: 1px; background: var(--border-color); margin: 4px 0; }

    /* Color/width picker dropdown */
    .pdf-color-picker {
        position: absolute; top: 38px; left: 50%; transform: translateX(-50%);
        z-index: 50; display: flex; flex-wrap: wrap; gap: 4px;
        padding: 8px; background: var(--card-bg); border: 1px solid var(--border-color);
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); min-width: 120px;
    }
    .pdf-color-dot {
        width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent;
        cursor: pointer; transition: transform 0.1s;
    }
    .pdf-color-dot:hover { transform: scale(1.15); }
    .pdf-width-dot {
        width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border-color);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; background: transparent;
    }

    /* ═══ Search Bar ═══ */
    .pdf-search-bar {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px; background: var(--card-bg);
        border-bottom: 1px solid var(--border-color); flex-shrink: 0;
    }

    /* ═══ Sidebar ═══ */
    .pdf-sidebar {
        width: 180px; min-width: 180px; display: flex; flex-direction: column;
        border-right: 1px solid var(--border-color);
        background: var(--bg-secondary); flex-shrink: 0; overflow: hidden;
    }
    .pdf-thumb {
        display: flex; flex-direction: column; align-items: center;
        padding: 4px; border-radius: 8px; border: 2px solid transparent;
        cursor: pointer; transition: all 0.15s; width: 100%;
        background: transparent;
    }
    .pdf-thumb:hover { background: var(--bg-primary); }
    .pdf-thumb-active { border-color: var(--accent); background: rgba(var(--accent-rgb, 52,211,153), 0.08); }
    .pdf-thumb canvas { border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }

    /* ═══ Main Viewer ═══ */
    .pdf-main-viewer {
        flex: 1; overflow: auto; display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start;
        padding: 16px; min-height: 0;
        background: var(--bg-secondary);
        gap: 16px;
    }
    .pdf-main-viewer > .react-pdf__Document {
        display: flex; flex-direction: column;
        align-items: center; gap: 16px;
        width: 100%;
    }

    /* ═══ Page ═══ */
    .pdf-page-wrapper {
        position: relative; display: inline-block;
        box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        border-radius: 4px; overflow: hidden;
        background: white;
    }
    .pdf-page-wrapper .react-pdf__Page { display: block; }
    .pdf-page-wrapper .react-pdf__Page canvas { display: block; }

    /* Drawing overlay */
    .pdf-draw-layer {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 5;
    }

    /* Page number badge */
    .pdf-page-number {
        position: absolute; bottom: 6px; right: 8px;
        font-size: 10px; color: rgba(0,0,0,0.4);
        background: rgba(255,255,255,0.7);
        padding: 1px 6px; border-radius: 4px;
        pointer-events: none; z-index: 6;
    }

    /* ═══ Text Layer (for selection) ═══ */
    .react-pdf__Page__textContent {
        z-index: 3 !important;
    }
    .react-pdf__Page__textContent span {
        opacity: 0.15;
    }
    .react-pdf__Page__textContent span::selection {
        background: rgba(33, 150, 243, 0.35);
    }

    /* ═══ Annotation Layer ═══ */
    .react-pdf__Page__annotations { z-index: 4 !important; }
    .react-pdf__Page__annotations a { color: #2563eb; }

    /* ═══ Scrollbar ═══ */
    .pdf-main-viewer::-webkit-scrollbar { width: 8px; height: 8px; }
    .pdf-main-viewer::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 4px; }
    .pdf-main-viewer::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.5); }
    .pdf-main-viewer::-webkit-scrollbar-track { background: transparent; }
    .pdf-sidebar::-webkit-scrollbar { width: 5px; }
    .pdf-sidebar > div::-webkit-scrollbar { width: 5px; }
    .pdf-sidebar > div::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 4px; }
`;
