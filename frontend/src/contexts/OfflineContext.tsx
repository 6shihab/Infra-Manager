import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { queryClient } from '../main';

interface OfflineContextType {
    isOnline: boolean;
    pendingSyncCount: number;
    triggerSync: () => void;
}

const OfflineContext = createContext<OfflineContextType>({
    isOnline: true,
    pendingSyncCount: 0,
    triggerSync: () => {},
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);

    useEffect(() => {
        if (!window.electronAPI) return;

        // Get initial status
        window.electronAPI.getConnectivityStatus().then(({ isOnline: online }) => {
            setIsOnline(online);
        });

        // Listen for connectivity changes
        const unsubConnectivity = window.electronAPI.onConnectivityChange((online) => {
            setIsOnline(online);
        });

        // Listen for sync completion — refresh all React Query caches
        const unsubSync = window.electronAPI.onSyncComplete(() => {
            queryClient.invalidateQueries();
            // Refresh pending count
            window.electronAPI!.getSyncQueueCount().then(setPendingSyncCount);
        });

        // Poll pending sync count every 5 seconds
        const countInterval = setInterval(() => {
            window.electronAPI!.getSyncQueueCount().then(setPendingSyncCount);
        }, 5000);

        return () => {
            unsubConnectivity();
            unsubSync();
            clearInterval(countInterval);
        };
    }, []);

    const triggerSync = useCallback(() => {
        if (window.electronAPI) {
            window.electronAPI.triggerSync();
        }
    }, []);

    return (
        <OfflineContext.Provider value={{ isOnline, pendingSyncCount, triggerSync }}>
            {children}
        </OfflineContext.Provider>
    );
}

export function useOffline(): OfflineContextType {
    return useContext(OfflineContext);
}
