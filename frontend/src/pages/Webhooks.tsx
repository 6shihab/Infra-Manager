import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Webhook, Edit, Trash2, Play, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ApiError } from '../types/api';

interface Webhook {
    id: string;
    name: string;
    url: string;
    type: 'slack' | 'teams' | 'generic';
    events: string[];
    is_active: boolean;
    has_secret: boolean;
    created_at: string;
    project_ids: string[];
    projects: { id: string; name: string }[];
    last_triggered_at: string | null;
    last_status_code: number | null;
    last_error: string | null;
}

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function TypeBadge({ type }: { type: Webhook['type'] }) {
    const styles: Record<Webhook['type'], string> = {
        slack: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
        teams: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
        generic: 'bg-gray-500/15 text-gray-400 border border-gray-500/20',
    };
    const labels: Record<Webhook['type'], string> = {
        slack: 'Slack',
        teams: 'Teams',
        generic: 'Generic',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[type]}`}>
            {labels[type]}
        </span>
    );
}

function StatusIndicator({ code }: { code: number | null }) {
    if (code === null) {
        return (
            <span className="flex items-center gap-1.5 text-gray-500 text-xs">
                <span className="h-2 w-2 rounded-full bg-gray-500 inline-block" />
                Never
            </span>
        );
    }
    const isSuccess = code >= 200 && code < 300;
    return (
        <span className={`flex items-center gap-1.5 text-xs ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`h-2 w-2 rounded-full inline-block ${isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {code}
        </span>
    );
}

function ActiveToggle({ id, isActive, onChange }: { id: string; isActive: boolean; onChange: (id: string, next: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => onChange(id, !isActive)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-black/80 ${
                isActive ? 'bg-brand-600' : 'bg-white/10'
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                    isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
            />
        </button>
    );
}

export function Webhooks() {
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const toast = useToast();

    const fetchWebhooks = useCallback(async () => {
        try {
            const { data } = await api.get('/webhooks/');
            setWebhooks(data);
            setError('');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to load webhooks.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWebhooks();
    }, [fetchWebhooks]);

    const handleToggleActive = async (id: string, next: boolean) => {
        setWebhooks(prev =>
            prev.map(w => (w.id === id ? { ...w, is_active: next } : w))
        );
        try {
            await api.put(`/webhooks/${id}`, { is_active: next });
        } catch (err: unknown) {
            // Revert optimistic update on failure
            setWebhooks(prev =>
                prev.map(w => (w.id === id ? { ...w, is_active: !next } : w))
            );
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to update webhook.');
        }
    };

    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            await api.post(`/webhooks/${id}/test`);
            toast.success('Test payload sent successfully.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Test delivery failed.');
        } finally {
            setTestingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/webhooks/${id}`);
            setWebhooks(prev => prev.filter(w => w.id !== id));
            setConfirmDelete(null);
            toast.success('Webhook deleted.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to delete webhook.');
        } finally {
            setDeletingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Webhook className="h-6 w-6 text-brand-500" />
                        Webhooks
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Send event notifications to external services via HTTP.
                    </p>
                </div>
                <Link
                    to="/webhooks/new"
                    className="inline-flex items-center justify-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-500/20"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Webhook
                </Link>
            </div>

            {/* Error banner */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Empty state */}
            {webhooks.length === 0 && !error ? (
                <div className="text-center py-16 bg-dark-card/30 rounded-xl border border-dark-border">
                    <Webhook className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-1">No webhooks configured</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Connect external services to receive real-time event notifications.
                    </p>
                    <Link
                        to="/webhooks/new"
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first webhook
                    </Link>
                </div>
            ) : (
                /* Table */
                <div className="glass-panel rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-dark-border bg-black/20">
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Events</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Scope</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Active</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Triggered</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-border">
                                {webhooks.map(webhook => (
                                    <tr key={webhook.id} className="hover:bg-white/5 transition-colors group">
                                        {/* Name */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <span className="font-medium text-white">{webhook.name}</span>
                                        </td>

                                        {/* Type badge */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <TypeBadge type={webhook.type} />
                                        </td>

                                        {/* Events */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex flex-wrap gap-1 max-w-xs">
                                                {webhook.events.length === 0 ? (
                                                    <span className="text-gray-500 text-xs">—</span>
                                                ) : (
                                                    webhook.events.map(event => (
                                                        <span
                                                            key={event}
                                                            className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-dark-border text-gray-300"
                                                        >
                                                            {event}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </td>

                                        {/* Scope */}
                                        <td className="px-4 py-3 text-sm">
                                            {webhook.projects.length === 0 ? (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                                    All Projects
                                                </span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {webhook.projects.map(p => (
                                                        <span key={p.id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                                            {p.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>

                                        {/* Active toggle */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <ActiveToggle
                                                id={webhook.id}
                                                isActive={webhook.is_active}
                                                onChange={handleToggleActive}
                                            />
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <StatusIndicator code={webhook.last_status_code} />
                                        </td>

                                        {/* Last triggered */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-400">
                                            {formatRelativeTime(webhook.last_triggered_at)}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                                            <div className="inline-flex items-center gap-1">
                                                {/* Edit */}
                                                <Link
                                                    to={`/webhooks/${webhook.id}/edit`}
                                                    className="p-2 text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Link>

                                                {/* Test */}
                                                <button
                                                    onClick={() => handleTest(webhook.id)}
                                                    disabled={testingId === webhook.id}
                                                    className="p-2 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Send test payload"
                                                >
                                                    {testingId === webhook.id ? (
                                                        <span className="h-4 w-4 flex items-center justify-center">
                                                            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-400" />
                                                        </span>
                                                    ) : (
                                                        <Play className="h-4 w-4" />
                                                    )}
                                                </button>

                                                {/* Delete */}
                                                <button
                                                    onClick={() => setConfirmDelete({ id: webhook.id, name: webhook.name })}
                                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            <ConfirmDialog
                open={confirmDelete !== null}
                title="Delete Webhook"
                message={`Are you sure you want to delete the webhook "${confirmDelete?.name}"? This action cannot be undone.`}
                confirmText={confirmDelete?.name}
                loading={deletingId !== null}
                onConfirm={() => confirmDelete && handleDelete(confirmDelete.id)}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}
