import { useState, useEffect } from 'react';

/**
 * Detects actual mobile devices (phones/tablets) — NOT just small desktop windows.
 * Uses user-agent regex + touch capability as signals.
 */
function detectMobileDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

    const ua = navigator.userAgent || '';
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);

    // iPads on Safari report as "Macintosh" but have touch
    const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

    return mobileUA || isIPad;
}

export default function useMobile() {
    const [isMobile, setIsMobile] = useState(() => detectMobileDevice());

    // Keep useEffect to maintain consistent hook count across renders
    useEffect(() => {
        setIsMobile(detectMobileDevice());
    }, []);

    return isMobile;
}
