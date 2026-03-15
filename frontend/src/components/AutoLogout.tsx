import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';

const timeoutMinutes = parseInt(import.meta.env.VITE_AUTO_LOGOUT_MINUTES || '15', 10);
const INACTIVITY_TIMEOUT_MS = timeoutMinutes * 60 * 1000;

export function AutoLogout() {
    const { logout, user } = useAuth();
    const { isOnline } = useOffline();

    useEffect(() => {
        if (!user) return; // Don't track if not logged in
        // Don't auto-logout while offline — user needs cached session
        if (!isOnline) return;

        let timeoutId: number;

        const resetTimer = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                console.log(`User inactive for ${timeoutMinutes} minutes. Auto-logging out...`);
                logout();
            }, INACTIVITY_TIMEOUT_MS);
        };

        // Events to track user activity
        const events = [
            'mousemove',
            'keydown',
            'mousedown',
            'touchstart',
            'scroll'
        ];

        // Attach event listeners
        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        // Initialize the timer
        resetTimer();

        // Cleanup
        return () => {
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
            window.clearTimeout(timeoutId);
        };
    }, [logout, user, isOnline]);

    return null; // This component doesn't render anything
}
