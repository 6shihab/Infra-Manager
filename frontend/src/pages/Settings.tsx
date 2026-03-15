import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Save, AlertCircle, Settings as SettingsIcon, User as UserIcon, Lock, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Select } from '../components/Select';

interface Setting {
    key: string;
    value: string;
    description: string;
}

interface UserOption {
    id: string;
    full_name: string | null;
    email: string;
}

export function Settings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Self password change state
    const [selfPw, setSelfPw] = useState({ current: '', next: '', confirm: '' });
    const [selfPwSaving, setSelfPwSaving] = useState(false);
    const [selfPwMsg, setSelfPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Admin password change state
    const [allUsers, setAllUsers] = useState<UserOption[]>([]);
    const [adminPwUserId, setAdminPwUserId] = useState('');
    const [adminPw, setAdminPw] = useState({ next: '', confirm: '' });
    const [adminPwSaving, setAdminPwSaving] = useState(false);
    const [adminPwMsg, setAdminPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchSettings();
        if (user?.is_superuser) fetchAllUsers();
    }, [user]);

    const fetchAllUsers = async () => {
        try {
            const res = await api.get('/users/');
            setAllUsers(res.data);
        } catch {
            // non-critical
        }
    };

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

    const handleSelfPwChange = async () => {
        if (selfPw.next !== selfPw.confirm) {
            setSelfPwMsg({ text: 'New passwords do not match.', type: 'error' });
            return;
        }
        setSelfPwSaving(true);
        setSelfPwMsg(null);
        try {
            await api.put('/users/me/password', { current_password: selfPw.current, new_password: selfPw.next });
            setSelfPwMsg({ text: 'Password changed successfully.', type: 'success' });
            setSelfPw({ current: '', next: '', confirm: '' });
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            let msg = 'Failed to change password.';
            if (typeof detail === 'string') msg = detail;
            else if (Array.isArray(detail) && detail.length > 0) msg = detail[0].msg.replace(/^Value error, /, '');
            setSelfPwMsg({ text: msg, type: 'error' });
        } finally {
            setSelfPwSaving(false);
            setTimeout(() => setSelfPwMsg(null), 4000);
        }
    };

    const handleAdminPwChange = async () => {
        if (!adminPwUserId) {
            setAdminPwMsg({ text: 'Please select a user.', type: 'error' });
            return;
        }
        if (adminPw.next !== adminPw.confirm) {
            setAdminPwMsg({ text: 'New passwords do not match.', type: 'error' });
            return;
        }
        setAdminPwSaving(true);
        setAdminPwMsg(null);
        try {
            await api.put(`/users/${adminPwUserId}/password`, { new_password: adminPw.next });
            setAdminPwMsg({ text: 'Password changed successfully.', type: 'success' });
            setAdminPw({ next: '', confirm: '' });
            setAdminPwUserId('');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            let msg = 'Failed to change password.';
            if (typeof detail === 'string') msg = detail;
            else if (Array.isArray(detail) && detail.length > 0) msg = detail[0].msg.replace(/^Value error, /, '');
            setAdminPwMsg({ text: msg, type: 'error' });
        } finally {
            setAdminPwSaving(false);
            setTimeout(() => setAdminPwMsg(null), 4000);
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

                {/* Change Own Password */}
                <div className="border-t border-dark-border pt-6 mt-2">
                    <div className="flex items-center gap-2 mb-4">
                        <Lock className="h-5 w-5 text-brand-500" />
                        <h3 className="text-base font-semibold text-white">Change Your Password</h3>
                    </div>
                    {selfPwMsg && (
                        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${selfPwMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {selfPwMsg.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                            {selfPwMsg.text}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Current Password</label>
                            <input type="password" value={selfPw.current} onChange={e => setSelfPw(p => ({ ...p, current: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="••••••••" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">New Password</label>
                            <input type="password" value={selfPw.next} onChange={e => setSelfPw(p => ({ ...p, next: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="••••••••" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Confirm New Password</label>
                            <input type="password" value={selfPw.confirm} onChange={e => setSelfPw(p => ({ ...p, confirm: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="••••••••" />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={handleSelfPwChange} disabled={selfPwSaving} className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {selfPwSaving ? 'Saving...' : <><Lock className="mr-2 h-4 w-4" />Change Password</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Admin: Change Any User's Password (Superuser Only) */}
            {user?.is_superuser && (
                <div className="glass-panel p-6 rounded-xl space-y-4">
                    <div className="flex items-center gap-3 border-b border-dark-border pb-4 mb-4">
                        <Lock className="h-6 w-6 text-brand-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Change User Password</h2>
                            <p className="text-sm text-gray-400">Reset the password for any user account.</p>
                        </div>
                    </div>
                    {adminPwMsg && (
                        <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${adminPwMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {adminPwMsg.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                            {adminPwMsg.text}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Select User</label>
                            <Select
                                value={adminPwUserId}
                                onChange={setAdminPwUserId}
                                options={allUsers.map((u: any) => ({
                                    value: u.id,
                                    label: u.full_name ? `${u.full_name} (${u.email})` : u.email
                                }))}
                                placeholder="-- Select a user --"
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">New Password</label>
                            <input type="password" value={adminPw.next} onChange={e => setAdminPw(p => ({ ...p, next: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="••••••••" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Confirm New Password</label>
                            <input type="password" value={adminPw.confirm} onChange={e => setAdminPw(p => ({ ...p, confirm: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="••••••••" />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={handleAdminPwChange} disabled={adminPwSaving} className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                            {adminPwSaving ? 'Saving...' : <><Lock className="mr-2 h-4 w-4" />Set Password</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Desktop Connection Settings (Electron only) */}
            {window.electronAPI && (
                <div className="glass-panel p-6 rounded-xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Server className="h-6 w-6 text-brand-500" />
                            <div>
                                <h2 className="text-xl font-bold text-white">Backend Connection</h2>
                                <p className="text-sm text-gray-400">Configure the server URL this desktop app connects to.</p>
                            </div>
                        </div>
                        <Link
                            to="/settings/connection"
                            className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Configure
                        </Link>
                    </div>
                </div>
            )}

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
                                    <Select
                                        value={setting.value}
                                        onChange={(value) => handleValueChange(setting.key, value)}
                                        options={[
                                            { value: 'dark', label: 'Dark Theme' },
                                            { value: 'light', label: 'Light Theme' },
                                        ]}
                                        className="w-full md:w-1/2"
                                    />
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
