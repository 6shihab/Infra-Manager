import { useRef, useEffect, useState } from 'react';
import { Bell, ServerCrash, FolderX, Activity, X } from 'lucide-react';
import { useNotifications, type Notification } from '../contexts/NotificationsContext';

function formatRelativeTime(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function NotificationIcon({ type }: { type: Notification['type'] }) {
    if (type === 'SERVER_OFFLINE') return <ServerCrash className="h-4 w-4 text-red-400 shrink-0" />;
    if (type === 'PROJECT_OFFLINE') return <FolderX className="h-4 w-4 text-orange-400 shrink-0" />;
    return <Activity className="h-4 w-4 text-brand-400 shrink-0" />;
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string | number) => void }) {
    const label = notification.resource_name
        ? `${notification.action} ${notification.resource_type}: ${notification.resource_name}`
        : `${notification.action} ${notification.resource_type}`;

    return (
        <div
            className={`flex gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors ${!notification.read ? 'bg-brand-500/5' : ''}`}
            onClick={() => onRead(notification.id)}
        >
            <div className="mt-0.5">
                <NotificationIcon type={notification.type} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${!notification.read ? 'text-white font-medium' : 'text-gray-300'}`}>
                    {label}
                </p>
                {notification.actor_name && (
                    <p className="text-xs text-gray-500 truncate">by {notification.actor_name}</p>
                )}
                <p className="text-xs text-gray-600 mt-0.5">{formatRelativeTime(notification.timestamp)}</p>
            </div>
            {!notification.read && (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-500 shrink-0" />
            )}
        </div>
    );
}

export function NotificationDropdown() {
    const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = () => {
        setOpen(prev => !prev);
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={handleOpen}
                className="p-2 text-gray-400 hover:text-white transition-colors duration-200 relative"
                aria-label="View notifications"
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-dark-card border border-dark-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
                        <span className="text-sm font-semibold text-white">
                            Notifications {unreadCount > 0 && <span className="ml-1 text-xs text-brand-400">({unreadCount})</span>}
                        </span>
                        <div className="flex gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-xs text-gray-400 hover:text-white transition-colors"
                                >
                                    Mark all read
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="text-gray-500 hover:text-gray-300 transition-colors"
                                    aria-label="Clear all"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List */}
                    <div className="max-h-96 overflow-y-auto divide-y divide-dark-border/50">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                                <Bell className="h-8 w-8 mb-2 opacity-30" />
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <NotificationItem key={n.id} notification={n} onRead={markRead} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
