import { useState, useEffect, useCallback } from 'react';
import { BackupExportModal } from '../components/BackupExportModal';
import { BackupImportModal } from '../components/BackupImportModal';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Save, AlertCircle, Settings as SettingsIcon, User as UserIcon, Lock, Server, Shield, WifiOff, Smartphone, Fingerprint, Trash2, Pencil, Plus, Check, X, Download, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { Select } from '../components/Select';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ApiError } from '../types/api';

interface Setting {
    key: string;
    value: string;
    description: string;
}

interface MfaCredential {
    id: string;
    type: string;
    label: string | null;
    created_date: number | null;
}

interface MfaStatus {
    totp: MfaCredential[];
    passkeys: MfaCredential[];
}

export function Settings() {
    const { user, triggerKcAction } = useAuth();
    const { isOnline } = useOffline();
    const offlineElectron = !isOnline && !!window.electronAPI;
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Self password change state
    const [selfPw, setSelfPw] = useState({ next: '', confirm: '' });
    const [selfPwSaving, setSelfPwSaving] = useState(false);
    const [selfPwMsg, setSelfPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    // MFA state
    const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
    const [mfaLoading, setMfaLoading] = useState(true);
    const [deletingCred, setDeletingCred] = useState<{ id: string; label: string } | null>(null);
    const [editingLabel, setEditingLabel] = useState<{ id: string; label: string } | null>(null);

    const fetchMfaStatus = useCallback(async () => {
        try {
            const res = await api.get('/mfa/credentials');
            setMfaStatus(res.data);
        } catch {
            setMfaStatus({ totp: [], passkeys: [] });
        } finally {
            setMfaLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
        fetchMfaStatus();
    }, [user, fetchMfaStatus]);

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
            for (const setting of settings) {
                await api.put(`/settings/${setting.key}`, {
                    value: setting.value,
                    description: setting.description
                });
            }
            setMessage({ text: 'Settings saved successfully!', type: 'success' });
            window.dispatchEvent(new Event('settings-updated'));
        } catch (err) {
            console.error("Failed to save settings", err);
            setMessage({ text: 'An error occurred while saving settings.', type: 'error' });
        } finally {
            setSaving(false);
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
            await api.put('/users/me/password', { new_password: selfPw.next });
            setSelfPwMsg({ text: 'Password changed successfully.', type: 'success' });
            setSelfPw({ next: '', confirm: '' });
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            let msg = 'Failed to change password.';
            if (typeof detail === 'string') msg = detail;
            else if (Array.isArray(detail) && detail.length > 0) msg = detail[0].msg.replace(/^Value error, /, '');
            setSelfPwMsg({ text: msg, type: 'error' });
        } finally {
            setSelfPwSaving(false);
            setTimeout(() => setSelfPwMsg(null), 4000);
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
                    <form onSubmit={e => { e.preventDefault(); handleSelfPwChange(); }}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">New Password</label>
                                <input type="password" value={selfPw.next} onChange={e => setSelfPw(p => ({ ...p, next: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="Enter new password" autoComplete="new-password" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Confirm New Password</label>
                                <input type="password" value={selfPw.confirm} onChange={e => setSelfPw(p => ({ ...p, confirm: e.target.value }))} className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white" placeholder="Confirm new password" autoComplete="new-password" />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="submit" disabled={selfPwSaving || offlineElectron} className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50" title={offlineElectron ? 'Requires connection' : undefined}>
                                {offlineElectron ? <><WifiOff className="mr-2 h-4 w-4" />Requires Connection</> : selfPwSaving ? 'Saving...' : <><Lock className="mr-2 h-4 w-4" />Change Password</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Security — In-App MFA Management */}
            <div className="glass-panel p-6 rounded-xl space-y-6">
                <div className="flex items-center gap-3 border-b border-dark-border pb-4">
                    <Shield className="h-6 w-6 text-brand-500" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Security</h2>
                        <p className="text-sm text-gray-400">Manage two-factor authentication and passkeys.</p>
                    </div>
                </div>

                {mfaLoading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
                    </div>
                ) : (
                    <>
                        {/* TOTP / Authenticator App */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Smartphone className="h-5 w-5 text-brand-400" />
                                    <h3 className="text-base font-semibold text-white">Authenticator App</h3>
                                </div>
                                <button
                                    onClick={() => triggerKcAction('CONFIGURE_TOTP')}
                                    disabled={offlineElectron}
                                    className="inline-flex items-center px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add Device
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">Use an authenticator app (Google Authenticator, Microsoft Authenticator) to generate one-time codes.</p>

                            {mfaStatus?.totp.length === 0 ? (
                                <div className="text-sm text-gray-500 bg-black/20 border border-dark-border rounded-lg px-4 py-3">
                                    No authenticator app configured.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {mfaStatus?.totp.map(cred => (
                                        <div key={cred.id} className="flex items-center justify-between bg-black/20 border border-dark-border rounded-lg px-4 py-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Smartphone className="h-4 w-4 text-gray-400 shrink-0" />
                                                {editingLabel?.id === cred.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={editingLabel.label}
                                                            onChange={e => setEditingLabel({ ...editingLabel, label: e.target.value })}
                                                            className="px-2 py-1 bg-black/30 border border-brand-500 rounded text-sm text-white focus:outline-none w-40"
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    api.put(`/mfa/credentials/${cred.id}/label`, { label: editingLabel.label })
                                                                        .then(() => { fetchMfaStatus(); setEditingLabel(null); });
                                                                } else if (e.key === 'Escape') setEditingLabel(null);
                                                            }}
                                                        />
                                                        <button onClick={() => {
                                                            api.put(`/mfa/credentials/${cred.id}/label`, { label: editingLabel.label })
                                                                .then(() => { fetchMfaStatus(); setEditingLabel(null); });
                                                        }} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
                                                        <button onClick={() => setEditingLabel(null)} className="text-gray-400 hover:text-gray-300"><X className="h-4 w-4" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-white truncate">{cred.label || 'Authenticator'}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs text-gray-500">{cred.created_date ? new Date(cred.created_date).toLocaleDateString() : ''}</span>
                                                <button onClick={() => setEditingLabel({ id: cred.id, label: cred.label || '' })} className="p-1 text-gray-400 hover:text-white transition-colors" title="Rename">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => setDeletingCred({ id: cred.id, label: cred.label || 'Authenticator' })} className="p-1 text-gray-400 hover:text-red-400 transition-colors" title="Remove">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Passkeys / Biometric */}
                        <div className="border-t border-dark-border pt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Fingerprint className="h-5 w-5 text-brand-400" />
                                    <h3 className="text-base font-semibold text-white">Passkeys</h3>
                                </div>
                                <button
                                    onClick={() => triggerKcAction('webauthn-register-passwordless')}
                                    disabled={offlineElectron}
                                    className="inline-flex items-center px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add Passkey
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">Sign in with biometrics (fingerprint, face) or a security key — no password needed.</p>

                            {mfaStatus?.passkeys.length === 0 ? (
                                <div className="text-sm text-gray-500 bg-black/20 border border-dark-border rounded-lg px-4 py-3">
                                    No passkeys registered.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {mfaStatus?.passkeys.map(cred => (
                                        <div key={cred.id} className="flex items-center justify-between bg-black/20 border border-dark-border rounded-lg px-4 py-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Fingerprint className="h-4 w-4 text-gray-400 shrink-0" />
                                                {editingLabel?.id === cred.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={editingLabel.label}
                                                            onChange={e => setEditingLabel({ ...editingLabel, label: e.target.value })}
                                                            className="px-2 py-1 bg-black/30 border border-brand-500 rounded text-sm text-white focus:outline-none w-40"
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    api.put(`/mfa/credentials/${cred.id}/label`, { label: editingLabel.label })
                                                                        .then(() => { fetchMfaStatus(); setEditingLabel(null); });
                                                                } else if (e.key === 'Escape') setEditingLabel(null);
                                                            }}
                                                        />
                                                        <button onClick={() => {
                                                            api.put(`/mfa/credentials/${cred.id}/label`, { label: editingLabel.label })
                                                                .then(() => { fetchMfaStatus(); setEditingLabel(null); });
                                                        }} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
                                                        <button onClick={() => setEditingLabel(null)} className="text-gray-400 hover:text-gray-300"><X className="h-4 w-4" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-white truncate">{cred.label || 'Passkey'}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs text-gray-500">{cred.created_date ? new Date(cred.created_date).toLocaleDateString() : ''}</span>
                                                <button onClick={() => setEditingLabel({ id: cred.id, label: cred.label || '' })} className="p-1 text-gray-400 hover:text-white transition-colors" title="Rename">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => setDeletingCred({ id: cred.id, label: cred.label || 'Passkey' })} className="p-1 text-gray-400 hover:text-red-400 transition-colors" title="Remove">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Delete MFA Credential Confirmation */}
            <ConfirmDialog
                open={!!deletingCred}
                title="Remove Credential"
                message={`Are you sure you want to remove "${deletingCred?.label}"? You may lose access to your account if you remove all authentication methods.`}
                confirmLabel="Remove"
                onConfirm={async () => {
                    if (!deletingCred) return;
                    try {
                        await api.delete(`/mfa/credentials/${deletingCred.id}`);
                        fetchMfaStatus();
                    } catch {
                        setMessage({ text: 'Failed to remove credential.', type: 'error' });
                        setTimeout(() => setMessage(null), 3000);
                    }
                    setDeletingCred(null);
                }}
                onCancel={() => setDeletingCred(null)}
            />

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

            {/* Backup & Restore Section (Superuser Only) */}
            {user?.is_superuser && (
                <div className="glass-panel p-6 rounded-xl space-y-6">
                    <div className="flex items-center gap-3 border-b border-dark-border pb-4">
                        <Download className="h-6 w-6 text-brand-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Backup & Restore</h2>
                            <p className="text-sm text-gray-400">Export system data or import from a backup file.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Export Full Backup
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="inline-flex items-center px-4 py-2 bg-white/5 border border-dark-border text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            Import Backup
                        </button>
                    </div>
                </div>
            )}

            <BackupExportModal open={showExportModal} onClose={() => setShowExportModal(false)} />
            <BackupImportModal open={showImportModal} onClose={() => setShowImportModal(false)} />
        </div>
    );
}
