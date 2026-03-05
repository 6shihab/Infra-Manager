import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Save, AlertCircle, Settings as SettingsIcon, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Setting {
    key: string;
    value: string;
    description: string;
}

export function Settings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await api.get('/settings/');
            setSettings(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch settings", err);
            setMessage({ text: 'Failed to load settings from server.', type: 'error' });
            setLoading(false);
        }
    };

    const handleValueChange = (key: string, newValue: string) => {
        setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            // Save all settings in parallel or sequentially. We will do it sequentially to handle errors.
            for (const setting of settings) {
                await api.put(`/settings/${setting.key}`, {
                    value: setting.value,
                    description: setting.description
                });
            }
            setMessage({ text: 'Settings saved successfully!', type: 'success' });

            // Dispatch a custom event in case other components (like Sidebar) want to update their state based on Settings
            window.dispatchEvent(new Event('settings-updated'));

        } catch (err) {
            console.error("Failed to save settings", err);
            setMessage({ text: 'An error occurred while saving settings.', type: 'error' });
        } finally {
            setSaving(false);
            // Clear success message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <SettingsIcon className="h-6 w-6 text-brand-500" /> Settings
                </h1>
                <p className="text-sm text-gray-400 mt-1">View personal details and configure platform preferences.</p>
            </div>

            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {message.type === 'error' && <AlertCircle className="h-5 w-5" />}
                    <p className="text-sm font-medium">{message.text}</p>
                </div>
            )}

            {/* User Profile Section */}
            <div className="glass-panel p-6 rounded-xl space-y-4">
                <div className="flex items-center gap-3 border-b border-dark-border pb-4 mb-4">
                    <UserIcon className="h-6 w-6 text-brand-500" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Your Profile</h2>
                        <p className="text-sm text-gray-400">View your personal account details.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                        <div className="text-white bg-black/30 border border-dark-border px-4 py-2 rounded-lg">{user?.full_name || 'Not provided'}</div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                        <div className="text-white bg-black/30 border border-dark-border px-4 py-2 rounded-lg">{user?.email}</div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Role</label>
                        <div>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-brand-500/30 bg-brand-500/10 text-brand-400 mt-1">
                                {user?.is_superuser ? 'Superuser' : 'Standard User'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Platform Settings Section (Superuser Only) */}
            {user?.is_superuser && (
                <div className="glass-panel p-6 rounded-xl space-y-6 mt-8">
                    <div className="flex items-center gap-3 border-b border-dark-border pb-4 mb-4">
                        <SettingsIcon className="h-6 w-6 text-brand-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Platform Settings</h2>
                            <p className="text-sm text-gray-400">Configure global application preferences.</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {settings.map((setting) => (
                            <div key={setting.key} className="border-b border-dark-border pb-5 last:border-0 last:pb-0">
                                <label className="block text-sm font-medium text-gray-200 mb-1 capitalize">
                                    {setting.key.replace(/_/g, ' ')}
                                </label>
                                <p className="text-xs text-gray-500 mb-3">{setting.description}</p>

                                {setting.key === 'theme' ? (
                                    <select
                                        value={setting.value}
                                        onChange={(e) => handleValueChange(setting.key, e.target.value)}
                                        className="w-full md:w-1/2 px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white appearance-none"
                                    >
                                        <option value="dark">Dark Theme</option>
                                        <option value="light">Light Theme</option>
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={setting.value}
                                        onChange={(e) => handleValueChange(setting.key, e.target.value)}
                                        className="w-full md:w-1/2 px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 mt-6 border-t border-dark-border flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving Changes...' : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save All Settings
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
