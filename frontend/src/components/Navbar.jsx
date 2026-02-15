import { useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
    Search, Grid3x3, List, Upload, Sun, Moon, ChevronRight,
    LogOut, Home, Activity, ArrowLeft
} from 'lucide-react';

export default function Navbar({
    breadcrumbs = [],
    onBreadcrumbClick,
    searchQuery,
    onSearchChange,
    viewMode,
    onViewModeChange,
    onUpload,
    onToggleActivity,
    showBackButton,
    onBack,
}) {
    const { isDark, toggle } = useTheme();
    const { user, logout } = useAuth();
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) onUpload(files);
        e.target.value = '';
    };

    return (
        <header className="flex items-center h-[52px] px-4 gap-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex-shrink-0">
            {/* Back button for editor */}
            {showBackButton && (
                <button
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors mr-1"
                >
                    <ArrowLeft className="w-4 h-4" />
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
                                    <Home className="w-3.5 h-3.5" />
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
                <div className="relative max-w-[240px] w-full">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                </div>
            )}

            {/* View toggles (only in file view) */}
            {!showBackButton && (
                <div className="flex items-center border border-[var(--border-color)] rounded-lg overflow-hidden">
                    <button
                        onClick={() => onViewModeChange('grid')}
                        className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                    >
                        <Grid3x3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onViewModeChange('list')}
                        className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                    >
                        <List className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Upload (only in file view) */}
            {!showBackButton && (
                <>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium rounded-lg transition-colors"
                    >
                        <Upload className="w-3.5 h-3.5" />
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
                <Activity className="w-4 h-4" />
            </button>

            {/* Theme toggle */}
            <button
                onClick={toggle}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User avatar / Logout */}
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[12px] font-semibold">
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <button
                    onClick={logout}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Logout"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
        </header>
    );
}
