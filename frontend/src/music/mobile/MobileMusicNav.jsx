import { useState } from 'react';
import { Home, Compass, Library, Youtube, Settings, Play } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function MobileMusicNav() {
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active tab based on path
    const getActiveTab = () => {
        const path = location.pathname;
        if (path === '/music' || path === '/music/') return 'home';
        if (path.includes('/music/discovery')) return 'discovery';
        if (path.includes('/music/library') || path.includes('/music/playlists')) return 'library';
        if (path.includes('/music/youtube')) return 'youtube';
        return 'home';
    };

    const activeTab = getActiveTab();

    const tabs = [
        { id: 'home', icon: Home, label: 'Home', path: '/music' },
        { id: 'discovery', icon: Compass, label: 'Discover', path: '/music/discovery' },
        { id: 'library', icon: Library, label: 'Library', path: '/music/library' },
        { id: 'youtube', icon: Youtube, label: 'YouTube', path: '/music/youtube' },
    ];

    return (
        <nav
            className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-around bg-[var(--card-bg)] border-t border-[var(--border-color)] backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
            style={{ height: 'calc(60px + env(safe-area-inset-bottom))' }}
        >
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => navigate(tab.path)}
                        className={`flex flex-col items-center justify-center gap-1 flex-1 h-full py-1 transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
                            }`}
                    >
                        <tab.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                        <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
