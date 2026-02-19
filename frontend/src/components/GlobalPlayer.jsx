import { useLocation } from 'react-router-dom';
import { useMusic } from '../context/MusicContext';
import MiniPlayer from './MiniPlayer';

export default function GlobalPlayer() {
    const { currentSong } = useMusic();
    const location = useLocation();

    // If no song is playing, don't show anything
    if (!currentSong) return null;

    // If we are in the music section, don't show the mini player
    // (The full player in MusicLayout will handle it)
    if (location.pathname.startsWith('/music')) {
        return null;
    }

    return <MiniPlayer />;
}
