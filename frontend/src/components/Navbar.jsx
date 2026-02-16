import { useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
    Search, Grid3x3, List, Upload, FolderUp, Sun, Moon, ChevronRight,
    Home, Activity, ArrowLeft
} from 'lucide-react';

export default function Navbar({
    breadcrumbs = [],
    onBreadcrumbClick,
    searchQuery,
    onSearchChange,
    viewMode,
    onViewModeChange,
    onUpload,
    onUploadFolder,
    onToggleActivity,
    showBackButton,
    onBack,
    onOpenSearch,
}) {
    const { isDark, toggleTheme } = useTheme();
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    useEffect(() => {
        if (folderInputRef.current) {
            folderInputRef.current.setAttribute('webkitdirectory', '');
            folderInputRef.current.setAttribute('directory', '');
        }
    }, []);

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) onUpload(files);
        e.target.value = '';
    };

    const handleFolderSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0 && onUploadFolder) onUploadFolder(files);
        e.target.value = '';
    };

    return (
        <header className="flex items-center md:h-[58px] px-3 md:px-5 py-2 md:py-0 gap-2 md:gap-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)] sticky top-0 z-20 backdrop-blur-sm flex-shrink-0 flex-wrap md:flex-nowrap">
            {/* Back button for editor */}
            {showBackButton && (
                <button
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors mr-1"
                >
                    <ArrowLeft className="w-4 h-4 app-icon-solid" />
                </button>
            )}

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-0.5 text-[13px] min-w-0 flex-shrink">
                {breadcrumbs.map((crumb, i) => (
                    <div key={crumb.id || 'root'} className="flex items-center gap-0.5">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0" />}
                        <button
                            onClick={() => onBreadcrumbClick(crumb.id)}
                            className={`px-1.5 py-0.5 rounded-md transition-colors truncate max-w-[140px]
                ${i === breadcrumbs.length - 1
                                    ? 'text-[var(--text-primary)] font-medium'
                                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            {i === 0 ? (
                                <span className="flex items-center gap-1.5">
                                    <Home className="w-3.5 h-3.5 app-icon-solid" />
                                    {crumb.name}
                                </span>
                            ) : crumb.name}
                        </button>
                    </div>
                ))}
            </nav>

            <div className="flex-1" />

            {/* Search */}
            {!showBackButton && (
                <div className="relative w-full md:max-w-[430px] order-last md:order-none">
                    <button
                        onClick={onOpenSearch}
                        className="w-full flex items-center gap-2 pl-3 pr-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <Search className="w-3.5 h-3.5 app-icon-solid" />
                        <span className="text-[13px] font-normal">Search anything...</span>
                    </button>
                </div>
            )}

            {/* View toggles (only in file view) */}
            {!showBackButton && (
                <div className="hidden sm:flex items-center border border-[var(--border-color)] rounded-lg overflow-hidden">
                    <button
                        onClick={() => onViewModeChange('grid')}
                        className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                    >
                        <Grid3x3 className="w-3.5 h-3.5 app-icon-solid" />
                    </button>
                    <button
                        onClick={() => onViewModeChange('list')}
                        className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                    >
                        <List className="w-3.5 h-3.5 app-icon-solid" />
                    </button>
                </div>
            )}

            {/* Upload (only in file view) */}
            {!showBackButton && (
                <>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                    <input ref={folderInputRef} type="file" className="hidden" multiple onChange={handleFolderSelect} />

                    <button
                        onClick={() => folderInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-medium rounded-xl transition-colors border border-[var(--border-color)]"
                        title="Upload Folder"
                    >
                        <FolderUp className="w-3.5 h-3.5 app-icon-solid" />
                        <span className="hidden sm:inline">Folder</span>
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium rounded-xl transition-colors"
                    >
                        <Upload className="w-3.5 h-3.5 app-icon-solid" />
                        Upload
                    </button>
                </>
            )}

            {/* Activity toggle */}
            <button
                onClick={onToggleActivity}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                title="Activity"
            >
                <Activity className="w-4 h-4 app-icon-solid" />
            </button>

            {/* Theme toggle */}
            <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
                {isDark ? <Sun className="w-4 h-4 app-icon-solid" /> : <Moon className="w-4 h-4 app-icon-solid" />}
            </button>

        </header>
    );
}
