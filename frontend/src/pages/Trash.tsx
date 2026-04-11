import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, FolderKanban, Server, Database, Puzzle, FolderOpen } from 'lucide-react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateUtils';
import { useOffline } from '../contexts/OfflineContext';
import { Select } from '../components/Select';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useQueryClient } from '@tanstack/react-query';
import type { TrashItem, ApiError } from '../types/api';

const TYPE_OPTIONS = [
    { value: '', label: 'All Types' },
    { value: 'project_folder', label: 'Folders' },
    { value: 'project', label: 'Projects' },
    { value: 'server', label: 'Servers' },
    { value: 'database_engine', label: 'Databases' },
    { value: 'component', label: 'Components' },
];

const TYPE_ICON: Record<string, typeof Server> = {
    Project: FolderKanban,
    ProjectFolder: FolderOpen,
    Server: Server,
    DatabaseEngine: Database,
    Component: Puzzle,
};

const TYPE_KEY_MAP: Record<string, string> = {
    ProjectFolder: 'project_folder',
    Project: 'project',
    Server: 'server',
    DatabaseEngine: 'database_engine',
    Component: 'component',
};

export function Trash() {
    const { isOnline } = useOffline();
    const toast = useToast();
    const queryClient = useQueryClient();

    const [items, setItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [typeFilter, setTypeFilter] = useState('');

    const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchTrash = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (typeFilter) params.set('resource_type', typeFilter);
        api.get(`/trash/?${params.toString()}`)
            .then(res => {
                setItems(res.data);
                setTotalCount(parseInt(res.headers['x-total-count'] || res.data.length, 10));
            })
            .catch(() => {
                setItems([]);
                setTotalCount(0);
            })
            .finally(() => setLoading(false));
    }, [typeFilter]);

    useEffect(() => {
        fetchTrash();
    }, [fetchTrash]);

    const handleRestore = async () => {
        if (!restoreTarget) return;
        setRestoring(true);
        const typeKey = TYPE_KEY_MAP[restoreTarget.resource_type];
        try {
            await api.post(`/trash/${typeKey}/${restoreTarget.id}/restore`);
            toast.success(`"${restoreTarget.name}" restored`);
            invalidateCaches();
            fetchTrash();
        } catch (err) {
            const apiErr = err as ApiError;
            const detail = apiErr.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to restore');
        } finally {
            setRestoring(false);
            setRestoreTarget(null);
        }
    };

    const handlePermanentDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const typeKey = TYPE_KEY_MAP[deleteTarget.resource_type];
        try {
            await api.delete(`/trash/${typeKey}/${deleteTarget.id}`);
            toast.success(`"${deleteTarget.name}" permanently deleted`);
            invalidateCaches();
            fetchTrash();
        } catch {
            toast.error('Failed to delete');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const invalidateCaches = () => {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['servers'] });
        queryClient.invalidateQueries({ queryKey: ['databases'] });
        queryClient.invalidateQueries({ queryKey: ['project-folders'] });
        queryClient.invalidateQueries({ queryKey: ['project-folders-flat'] });
    };

    if (!isOnline && !!window.electronAPI) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-400 mb-4" />
                <h3 className="text-lg font-medium text-white mb-1">Requires Connection</h3>
                <p className="text-gray-400 text-sm">Trash management is not available offline.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        <Trash2 className="h-6 w-6 text-gray-400" />
                        Trash
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Deleted items are kept for 30 days before permanent removal.
                    </p>
                </div>
                <div className="text-sm text-gray-500">
                    {totalCount} {totalCount === 1 ? 'item' : 'items'}
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
                <Select
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={TYPE_OPTIONS}
                    className="w-full sm:w-44"
                />
            </div>

            {/* Content */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-panel rounded-xl p-4 animate-pulse">
                            <div className="flex items-center gap-4">
                                <div className="h-8 w-8 bg-white/5 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-1/3 bg-white/5 rounded" />
                                    <div className="h-3 w-1/4 bg-white/5 rounded" />
                                </div>
                                <div className="h-8 w-20 bg-white/5 rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-16 bg-dark-card/30 rounded-xl border border-dark-border">
                    <Trash2 className="mx-auto h-12 w-12 text-gray-600 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-1">Trash is empty</h3>
                    <p className="text-gray-400 text-sm">Deleted items will appear here for 30 days.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => {
                        const Icon = TYPE_ICON[item.resource_type] || Trash2;
                        const isUrgent = item.days_remaining <= 3;
                        const isWarning = item.days_remaining <= 7 && !isUrgent;

                        return (
                            <div key={`${item.resource_type}-${item.id}`} className="glass-panel rounded-xl p-4 flex items-center gap-4 group hover:border-dark-border/80 transition-colors">
                                {/* Icon */}
                                <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                    <Icon className="h-4.5 w-4.5 text-gray-400" />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white truncate">{item.name}</span>
                                        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full flex-shrink-0">
                                            {item.resource_type}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                        <span>Deleted {formatDateTime(item.deleted_at)}</span>
                                        {item.parent_name && (
                                            <span>
                                                in {item.parent_name}
                                                {item.parent_deleted && <span className="text-amber-500 ml-1">(also deleted)</span>}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Days remaining */}
                                <div className={`text-xs font-medium flex-shrink-0 px-2 py-1 rounded ${
                                    isUrgent ? 'text-red-400 bg-red-500/10' :
                                    isWarning ? 'text-amber-400 bg-amber-500/10' :
                                    'text-gray-400 bg-white/5'
                                }`}>
                                    {item.days_remaining}d left
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setRestoreTarget(item)}
                                        className="px-3 py-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 rounded-lg transition-colors flex items-center gap-1"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => setDeleteTarget(item)}
                                        className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Restore confirmation */}
            <ConfirmDialog
                open={!!restoreTarget}
                title="Restore Item"
                message={`Restore "${restoreTarget?.name}" from trash? It will reappear in its original location.`}
                confirmLabel="Restore"
                loading={restoring}
                onConfirm={handleRestore}
                onCancel={() => setRestoreTarget(null)}
            />

            {/* Permanent delete confirmation */}
            <ConfirmDialog
                open={!!deleteTarget}
                title="Permanently Delete"
                message={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
                confirmText={deleteTarget?.name}
                loading={deleting}
                onConfirm={handlePermanentDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}
