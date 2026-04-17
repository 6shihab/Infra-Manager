import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Webhook } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../components/Toast';
import { Select } from '../components/Select';

type WebhookType = 'slack' | 'teams' | 'generic';

const EVENT_OPTIONS = [
    { value: 'SERVER_OFFLINE', label: 'Server Offline' },
    { value: 'SERVER_ONLINE', label: 'Server Online' },
    { value: 'PROJECT_OFFLINE', label: 'Project Offline' },
    { value: 'PROJECT_ONLINE', label: 'Project Online' },
] as const;

const TYPE_OPTIONS = [
    { value: 'slack', label: 'Slack' },
    { value: 'teams', label: 'Microsoft Teams' },
    { value: 'generic', label: 'Generic HTTP' },
];

const URL_PLACEHOLDERS: Record<WebhookType, string> = {
    slack: 'https://hooks.slack.com/services/...',
    teams: 'https://outlook.office.com/webhook/...',
    generic: 'https://your-endpoint.com/webhook',
};

interface WebhookFormData {
    name: string;
    type: WebhookType;
    url: string;
    events: string[];
    project_ids: string[];
    secret: string;
    is_active: boolean;
}

export function WebhookForm() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditMode = Boolean(id);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);
    const [availableProjects, setAvailableProjects] = useState<{id: string; name: string}[]>([]);
    const queryClient = useQueryClient();
    const toast = useToast();

    const [formData, setFormData] = useState<WebhookFormData>({
        name: '',
        type: 'generic',
        url: '',
        events: [],
        project_ids: [],
        secret: '',
        is_active: true,
    });

    useEffect(() => {
        api.get('/projects/').then(res => setAvailableProjects(res.data)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEditMode) return;

        api.get(`/webhooks/${id}`)
            .then(res => {
                const webhook = res.data;
                setFormData({
                    name: webhook.name ?? '',
                    type: webhook.type ?? 'generic',
                    url: webhook.url ?? '',
                    events: Array.isArray(webhook.events) ? webhook.events : [],
                    project_ids: Array.isArray(webhook.project_ids) ? webhook.project_ids : [],
                    secret: '',
                    is_active: webhook.is_active ?? true,
                });
            })
            .catch(() => {
                toast.error('Webhook not found.');
                navigate('/webhooks');
            })
            .finally(() => setInitialLoading(false));
    }, [id, isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const allEventsSelected = EVENT_OPTIONS.every(e => formData.events.includes(e.value));

    const handleSelectAllEvents = () => {
        setFormData(prev => ({
            ...prev,
            events: allEventsSelected ? [] : EVENT_OPTIONS.map(e => e.value),
        }));
    };

    const handleEventToggle = (eventValue: string) => {
        setFormData(prev => ({
            ...prev,
            events: prev.events.includes(eventValue)
                ? prev.events.filter(e => e !== eventValue)
                : [...prev.events, eventValue],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.events.length === 0) {
            toast.error('Select at least one event to subscribe to.');
            return;
        }

        setLoading(true);
        try {
            if (isEditMode) {
                await api.put(`/webhooks/${id}`, formData);
                toast.success('Webhook updated.');
            } else {
                await api.post('/webhooks/', formData);
                toast.success('Webhook created.');
            }
            await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
            navigate('/webhooks');
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save webhook.';
            toast.error(message);
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
            <Link
                to="/webhooks"
                className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Webhooks
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <Webhook className="h-6 w-6 text-brand-500" />
                    {isEditMode ? 'Edit Webhook' : 'New Webhook'}
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                    {isEditMode
                        ? 'Update this webhook configuration.'
                        : 'Configure an outbound webhook to receive infrastructure event notifications.'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
                    <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="e.g. Slack Alerts"
                    />
                </div>

                {/* Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Type *</label>
                    <Select
                        value={formData.type}
                        onChange={(val: string) => setFormData({ ...formData, type: val as WebhookType })}
                        options={TYPE_OPTIONS}
                    />
                </div>

                {/* URL */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL *</label>
                    <input
                        required
                        type="url"
                        value={formData.url}
                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono text-sm"
                        placeholder={URL_PLACEHOLDERS[formData.type]}
                    />
                </div>

                {/* Events */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-300">Events *</label>
                        <button
                            type="button"
                            onClick={handleSelectAllEvents}
                            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                            {allEventsSelected ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {EVENT_OPTIONS.map(event => (
                            <label
                                key={event.value}
                                className="flex items-center gap-3 p-3 bg-black/20 border border-dark-border rounded-lg cursor-pointer hover:border-brand-500/50 transition-colors"
                            >
                                <input
                                    type="checkbox"
                                    checked={formData.events.includes(event.value)}
                                    onChange={() => handleEventToggle(event.value)}
                                    className="h-4 w-4 rounded border-dark-border text-brand-500 accent-brand-500"
                                />
                                <span className="text-sm text-gray-300">{event.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Projects — optional scope */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-200">Projects</label>
                        {formData.project_ids.length > 0 && (
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, project_ids: [] }))}
                                className="text-xs text-brand-400 hover:text-brand-300">Clear All</button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">Leave empty to receive notifications for all projects.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {availableProjects.map(project => (
                            <label key={project.id} className="flex items-center gap-3 p-3 bg-black/20 border border-dark-border rounded-lg cursor-pointer hover:border-brand-500/30 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={formData.project_ids.includes(project.id)}
                                    onChange={e => {
                                        setFormData(prev => ({
                                            ...prev,
                                            project_ids: e.target.checked
                                                ? [...prev.project_ids, project.id]
                                                : prev.project_ids.filter(id => id !== project.id)
                                        }));
                                    }}
                                    className="rounded border-dark-border bg-black/30 text-brand-500 focus:ring-brand-500"
                                />
                                <span className="text-sm text-gray-200">{project.name}</span>
                            </label>
                        ))}
                    </div>
                    {availableProjects.length === 0 && (
                        <p className="text-sm text-gray-500 bg-black/20 border border-dark-border rounded-lg px-4 py-3">No projects available.</p>
                    )}
                </div>

                {/* Secret */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Secret</label>
                    <input
                        type="password"
                        value={formData.secret}
                        onChange={e => setFormData({ ...formData, secret: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="Enter a signing secret"
                        autoComplete="new-password"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        Optional. Used for HMAC-SHA256 signature verification.
                    </p>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between py-3 px-4 bg-black/20 border border-dark-border rounded-lg">
                    <div>
                        <p className="text-sm font-medium text-gray-300">Active</p>
                        <p className="text-xs text-gray-500">Disable to pause deliveries without deleting the webhook.</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={formData.is_active}
                        onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-black ${
                            formData.is_active ? 'bg-brand-600' : 'bg-gray-700'
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                formData.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>

                {/* Submit */}
                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Webhook'}
                    </button>
                </div>
            </form>
        </div>
    );
}
