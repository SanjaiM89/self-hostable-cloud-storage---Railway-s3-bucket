import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MusicSidebar from './MusicSidebar';
import IconRail from '../components/IconRail';
import RightPanel from './RightPanel';
import Player from './Player';
import SmartSearch from './SmartSearch';
import { useAuth } from '../context/AuthContext';
import useMobile from '../mobile/useMobile';
import MobileMusicNav from './mobile/MobileMusicNav';
import { useMusic } from '../context/MusicContext';

export default function MusicLayout() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const { user } = useAuth();

    // Use Global Music Context
    const {
        currentSong,
        isPlaying,
        queue,
        setQueue,
        playSong,
        addToQueue,
        playNextInQueue,
        playNext,
        playPrev,
        togglePlay,
        audioRef
    } = useMusic();

    const isMobile = useMobile();

    if (isMobile) {
        return (
            <div className="flex flex-col h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans selection:bg-green-500 selection:text-white pb-[calc(64px+env(safe-area-inset-bottom))]">
                {/* Mobile Header */}
                <div className="h-16 flex items-center justify-between px-4 z-20 bg-[var(--bg-primary)]/80 backdrop-blur-md sticky top-0">
                    <div className="flex-1 max-w-xl">
                        <SmartSearch onPlay={playSong} />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border border-white/10 ml-3">
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-400 to-orange-500 text-white text-xs font-bold">
                            {user?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto px-3 pb-24 scrollbar-hide">
                    <Outlet context={{ playSong, addToQueue, playNextInQueue, currentSong, isPlaying, queue, setQueue }} />
                </div>

                {/* Player (Floating above Nav) */}
                {currentSong && (
                    <div className="fixed left-0 right-0 z-[55]" style={{ bottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
                        <Player
                            currentSong={currentSong}
                            isPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                            onNext={playNext}
                            onPrev={playPrev}
                            audioRef={audioRef}
                        />
                    </div>
                )}

                {/* Navigation */}
                <MobileMusicNav />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans selection:bg-green-500 selection:text-white transition-colors duration-200">

            {/* Left Rail (Icon Rail) */}
            <div className="h-full flex-shrink-0 z-30">
                <IconRail
                    onNavigate={(id) => { navigate(id ? `/?folder=${id}` : '/') }}
                    collapsed={false}
                    onToggleCollapse={() => setSidebarCollapsed(p => !p)}
                />
            </div>

            {/* Music Sidebar (Sub-navigation) */}
            <div className={`hidden md:block transition-all duration-300 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'} border-r border-[var(--sidebar-border)]`}>
                <MusicSidebar />
            </div>

            {/* Content Wrapper (Main + Right Panel + Player) */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">

                <div className="flex-1 flex overflow-hidden">
                    {/* Main Content Area */}
                    <main className="flex-1 flex flex-col min-w-0 relative">
                        {/* Search / Top Bar */}
                        <div className="h-20 flex items-center px-8 z-20">
                            <div className="flex-1 max-w-xl">
                                <SmartSearch onPlay={playSong} />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 pb-24 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                            <Outlet context={{ playSong, addToQueue, playNextInQueue, currentSong, isPlaying, queue, setQueue }} />
                        </div>
                    </main>

                    {/* Right Panel (Desktop Only) */}
                    <div className="hidden xl:block h-full border-l border-[var(--border-color)]">
                        <RightPanel
                            currentSong={currentSong}
                            isPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                            onNext={playNext}
                            onPrev={playPrev}
                        />
                    </div>
                </div>

                {/* Mobile/Tablet/Desktop Bottom Player (Always Visible) */}
                <div className="flex-shrink-0 z-50 w-full relative">
                    <Player
                        currentSong={currentSong}
                        isPlaying={isPlaying}
                        onTogglePlay={togglePlay}
                        onNext={playNext}
                        onPrev={playPrev}
                        audioRef={audioRef}
                    />
                </div>
            </div>
        </div>
    );
}
