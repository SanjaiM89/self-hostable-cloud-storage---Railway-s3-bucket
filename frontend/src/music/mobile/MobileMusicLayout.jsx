import { Outlet, useOutletContext } from 'react-router-dom';
import MobileMusicNav from './MobileMusicNav';
import Player from '../components/Player'; // Reusing Player for now, might need MobilePlayer later

export default function MobileMusicLayout() {
    // We need to pass the context from the parent route (App.jsx requests MusicLayout, which passes context to Outlet?)
    // Wait, MusicLayout IS the route element.
    // So MobileMusicLayout will be rendered INSTEAD of MusicLayout.
    // But MusicLayout manages the Player state (currentSong, isPlaying, etc.)
    // We need to life that state UP or duplicate it? 
    // Actually, App.jsx lazy loads MusicLayout. 
    // If we want to switch based on mobile, we might need a wrapper "MusicRoot" that decides.
    // OR, MusicLayout itself handles the check.

    // For now, let's assume MusicLayout handles the state and we are just refactoring MusicLayout 
    // to render this Mobile view if isMobile.
    // BUT, MusicLayout contains the logic for finding music, playing, etc.
    // So we should probably keep MusicLayout as the logic container, and have it render 
    // <MobileLayoutView> or <DesktopLayoutView>.

    // However, the instructions were "Implement MobileMusicLayout".
    // I will write this as a purely presentational component that takes props.

    return (
        <div className="flex flex-col h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto pb-32">
                {/* pb-32 to account for Player + Nav */}
                <Outlet />
            </div>

            {/* Player and Nav are fixed at bottom */}
            {/* We will render them in the parent container (MusicLayout) or here if we pass props */}
            {/* Actually, if we use this as the Layout, we need the Player state here or passed down. */}
        </div>
    );
}
