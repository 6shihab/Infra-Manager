import { useOffline } from '../contexts/OfflineContext';

export function OfflineBanner() {
    const { isOnline, pendingSyncCount } = useOffline();

    // In web mode or when online, don't show anything
    if (!window.electronAPI || isOnline) return null;

    return (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2.5 text-sm flex items-center gap-3 rounded-lg mx-3 sm:mx-6 mt-4 mb-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>
                <strong>Offline Mode</strong> — Changes will sync when connection restores
                {pendingSyncCount > 0 && (
                    <span className="ml-1.5 text-amber-300 font-medium">
                        ({pendingSyncCount} pending)
                    </span>
                )}
            </span>
        </div>
    );
}
