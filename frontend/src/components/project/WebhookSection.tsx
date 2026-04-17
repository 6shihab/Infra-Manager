import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../Toast';
import { Select } from '../Select';
import type { ApiError } from '../../types/api';

interface LinkedWebhook {
    id: string;
    name: string;
    type: 'slack' | 'teams' | 'generic';
    events: string[];
    is_active: boolean;
}

interface WebhookOption {
    id: string;
    name: string;
    type: 'slack' | 'teams' | 'generic';
    events: string[];
    is_active: boolean;
}

interface WebhookSectionProps {
    projectId: string;
}

const TYPE_BADGE_STYLES: Record<LinkedWebhook['type'], string> = {
    slack: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    teams: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
    generic: 'bg-gray-500/15 text-gray-400 border border-gray-500/20',
};

const TYPE_LABELS: Record<LinkedWebhook['type'], string> = {
    slack: 'Slack',
    teams: 'Teams',
    generic: 'Generic',
};

function TypeBadge({ type }: { type: LinkedWebhook['type'] }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE_STYLES[type]}`}>
            {TYPE_LABELS[type]}
        </span>
    );
}

export function WebhookSection({ projectId }: WebhookSectionProps) {
    const [linked, setLinked] = useState<LinkedWebhook[]>([]);
    const [allWebhooks, setAllWebhooks] = useState<WebhookOption[]>([]);
    const [loadingLinked, setLoadingLinked] = useState(true);
    const [loadingAll, setLoadingAll] = useState(true);
    const [selectedWebhookId, setSelectedWebhookId] = useState('');
    const [adding, setAdding] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const toast = useToast();

    const fetchLinked = useCallback(async () => {
        try {
            const { data } = await api.get(`/projects/${projectId}/webhooks`);
            setLinked(data);
        } catch {
            // Silently fail on initial load — avoid retry loops from toast re-renders
        } finally {
            setLoadingLinked(false);
        }
    }, [projectId]);

    const fetchAll = useCallback(async () => {
        try {
            const { data } = await api.get('/webhooks/');
            setAllWebhooks(data);
        } catch {
            // Silently fail on initial load
        } finally {
            setLoadingAll(false);
        }
    }, []);

    useEffect(() => {
        fetchLinked();
        fetchAll();
    }, [fetchLinked, fetchAll]);

    const handleAdd = async () => {
        if (!selectedWebhookId) return;
        setAdding(true);
        try {
            const updatedIds = [...linked.map(w => w.id), selectedWebhookId];
            const { data } = await api.put(`/projects/${projectId}/webhooks`, { webhook_ids: updatedIds });
            setLinked(data);
            setSelectedWebhookId('');
            setShowAdd(false);
            toast.success('Webhook linked to project.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to link webhook.');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (webhookId: string) => {
        try {
            const updatedIds = linked.filter(w => w.id !== webhookId).map(w => w.id);
            const { data } = await api.put(`/projects/${projectId}/webhooks`, { webhook_ids: updatedIds });
            setLinked(data);
            toast.success('Webhook removed from project.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to remove webhook.');
        }
    };

    const availableOptions = allWebhooks
        .filter(w => !linked.some(lw => lw.id === w.id))
        .map(w => ({ value: w.id, label: w.name }));

    const isLoading = loadingLinked || loadingAll;

    return (
        <div className="mt-8 bg-black/20 border border-brand-500/20 rounded-xl p-6">
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-xl font-semibold text-white flex items-center">
                        <Bell className="mr-2 h-6 w-6 text-brand-500" />
                        Webhooks
                    </h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        Link webhooks to receive event notifications for this project.
                    </p>
                </div>
                <button
                    onClick={() => { setShowAdd(!showAdd); setSelectedWebhookId(''); }}
                    disabled={isLoading || availableOptions.length === 0}
                    className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    title={availableOptions.length === 0 && !isLoading ? 'All webhooks are already linked' : undefined}
                >
                    {showAdd ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" />Add Webhook</>}
                </button>
            </div>

            {/* Add webhook inline form */}
            {showAdd && (
                <div className="mb-4 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                    <Select
                        value={selectedWebhookId}
                        onChange={setSelectedWebhookId}
                        options={availableOptions}
                        placeholder="Select a webhook..."
                        className="flex-1"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={!selectedWebhookId || adding}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    >
                        {adding ? 'Linking…' : 'Link'}
                    </button>
                </div>
            )}

            {/* Loading skeleton */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
                </div>
            ) : linked.length === 0 ? (
                /* Empty state */
                <div className="text-center py-8">
                    <Bell className="mx-auto h-10 w-10 text-gray-600 mb-3" />
                    <p className="text-gray-400 text-sm">
                        No webhooks linked to this project.{' '}
                        Link an existing webhook to receive notifications.
                    </p>
                </div>
            ) : (
                /* Linked webhooks list */
                <div className="space-y-2">
                    {linked.map(webhook => (
                        <div
                            key={webhook.id}
                            className="bg-black/20 border border-dark-border rounded-lg px-4 py-3 flex items-center gap-4 group"
                        >
                            {/* Active indicator */}
                            <span
                                className={`h-2 w-2 rounded-full shrink-0 ${webhook.is_active ? 'bg-emerald-500' : 'bg-gray-500'}`}
                                title={webhook.is_active ? 'Active' : 'Inactive'}
                            />

                            {/* Name */}
                            <span className="font-medium text-white text-sm flex-1 min-w-0 truncate">
                                {webhook.name}
                            </span>

                            {/* Type badge */}
                            <TypeBadge type={webhook.type} />

                            {/* Events */}
                            <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
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

                            {/* Remove button */}
                            <button
                                onClick={() => handleRemove(webhook.id)}
                                className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100 shrink-0"
                                title="Remove webhook from project"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
