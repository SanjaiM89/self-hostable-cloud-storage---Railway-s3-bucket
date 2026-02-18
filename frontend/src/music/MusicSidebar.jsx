import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Compass, User, Clock, Heart, Download, Disc, Layers } from 'lucide-react';

export default function MusicSidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const NavItem = ({ to, icon: Icon, label, activeColor = "text-[var(--accent)]" }) => {
        const isActive = location.pathname === to || (to !== '/music' && location.pathname.startsWith(to));
        return (
            <button
                onClick={() => navigate(to)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                    ? `bg-[var(--sidebar-active)] ${activeColor} font-bold shadow-sm`
                    : 'text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-hover)]'
                    }`}
            >
                <Icon size={20} className={isActive ? activeColor : "group-hover:text-[var(--sidebar-text-active)] transition-colors"} />
                <span>{label}</span>
                {isActive && <div className={`ml-auto w-1 h-4 rounded-full bg-current ${activeColor}`}></div>}
            </button>
        );
    };

    return (
        <div className="w-64 flex-shrink-0 flex flex-col h-full bg-[var(--sidebar-bg)] p-6 border-r border-[var(--sidebar-border)]">
            <div className="mb-10 px-2 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
                    <Disc className="text-white" size={20} />
                </div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Lazyio<span className="text-[var(--accent)]">Music</span></h1>
            </div>

            <div className="space-y-1 mb-8">
                <h3 className="text-xs font-bold text-[var(--sidebar-text)] opacity-70 px-4 mb-2 uppercase tracking-wider">Menu</h3>
                <NavItem to="/music" icon={Home} label="Home" />
                <NavItem to="/music/discovery" icon={Compass} label="Discover" />
                <NavItem to="/music/youtube" icon={Layers} label="YouTube" />
            </div>

            <div className="space-y-1 mb-8">
                <h3 className="text-xs font-bold text-[var(--sidebar-text)] opacity-70 px-4 mb-2 uppercase tracking-wider">Library</h3>
                <NavItem to="/music/library" icon={User} label="All Songs" />
                <NavItem to="/music/favorites" icon={Heart} label="Favorites" />
                <NavItem to="/music/playlists" icon={Disc} label="Playlists" />
            </div>
        </div>
    );
}


