import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';

export interface Notification {
    id: string | number;
    type: 'AUDIT' | 'SERVER_OFFLINE' | 'PROJECT_OFFLINE';
    action: string;
    resource_type: string;
    resource_name: string | null;
    timestamp: string;
    actor_name: string | null;
    read: boolean;
}

interface NotificationsContextType {
    notifications: Notification[];
    unreadCount: number;
    markAllRead: () => void;
    markRead: (id: string | number) => void;
    clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const MAX_NOTIFICATIONS = 50;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { token } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const esRef = useRef<EventSource | null>(null);

    const addNotification = useCallback((raw: Omit<Notification, 'read'>) => {
        setNotifications(prev => {
            // Deduplicate by id
            if (prev.some(n => n.id === raw.id)) return prev;
            const next = [{ ...raw, read: false }, ...prev];
            return next.slice(0, MAX_NOTIFICATIONS);
        });
    }, []);

    useEffect(() => {
        if (!token) {
            esRef.current?.close();
            esRef.current = null;
            setNotifications([]);
            return;
        }

        const baseUrl = (api.defaults.baseURL as string) || 'http://localhost:8000';
        const url = `${baseUrl}/notifications/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener('notification', (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data);
                addNotification(data);
                // Trigger native OS notification in Electron for offline alerts
                if (window.electronAPI && (data.type === 'SERVER_OFFLINE' || data.type === 'PROJECT_OFFLINE')) {
                    const title = data.type === 'SERVER_OFFLINE' ? 'Server Offline' : 'Project Offline';
                    window.electronAPI.showNativeNotification(title, data.resource_name || 'A resource went offline');
                }
            } catch {
                // malformed event — ignore
            }
        });

        es.onerror = () => {
            // Leave the EventSource open — browser auto-reconnects.
            // Keep esRef pointing to `es` so logout/re-login cleanup closes it correctly.
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [token, addNotification]);

    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const markRead = useCallback((id: string | number) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, clearAll }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationsContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationsProvider');
    }
    return context;
}
