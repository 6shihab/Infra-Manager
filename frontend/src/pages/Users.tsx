import { useState, useEffect, Fragment, useCallback } from 'react';
import api from '../utils/api';
import { Users as UsersIcon, UserPlus, Trash2, Shield, AlertCircle, WifiOff, Key, Fingerprint, Smartphone, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import type { ApiError } from '../types/api';

interface User {
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    is_superuser: boolean;
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

export function Users() {
    const { user: currentUser } = useAuth();
    const { isOnline } = useOffline();
    const toast = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

    // Form state
    const [isAdding, setIsAdding] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isSuperuser, setIsSuperuser] = useState(false);

    // Reset password inline panel state
    const [expandedPwRow, setExpandedPwRow] = useState<string | null>(null);
    const [pwForm, setPwForm] = useState({ next: '', confirm: '' });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // MFA management state
    const [mfaUserId, setMfaUserId] = useState<string | null>(null);
    const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
    const [mfaLoading, setMfaLoading] = useState(false);
    const [deletingCred, setDeletingCred] = useState<{ id: string; label: string; userId: string } | null>(null);
    const [togglingMfa, setTogglingMfa] = useState(false);

    const fetchMfa = useCallback(async (userId: string) => {
        setMfaLoading(true);
        try {
            const res = await api.get(`/mfa/users/${userId}/credentials`);
            setMfaStatus(res.data);
        } catch {
            setMfaStatus({ totp: [], passkeys: [] });
        } finally {
            setMfaLoading(false);
        }
    }, []);

    const openMfaPanel = (userId: string) => {
        if (mfaUserId === userId) {
            setMfaUserId(null);
            setMfaStatus(null);
        } else {
            setMfaUserId(userId);
            setExpandedPwRow(null);
            fetchMfa(userId);
        }
    };

    const handleDeleteCredential = async () => {
        if (!deletingCred) return;
        try {
            await api.delete(`/mfa/users/${deletingCred.userId}/credentials/${deletingCred.id}`);
            toast.success('Credential removed.');
            fetchMfa(deletingCred.userId);
        } catch {
            toast.error('Failed to remove credential.');
        }
        setDeletingCred(null);
    };

    const handleToggleMfaRequirement = async (userId: string, require: boolean) => {
        setTogglingMfa(true);
        try {
            await api.put(`/mfa/users/${userId}/require`, { require_totp: require });
            toast.success(require ? 'MFA required on next login.' : 'MFA requirement removed.');
        } catch {
            toast.error('Failed to update MFA requirement.');
        } finally {
            setTogglingMfa(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/users/');
            setUsers(res.data);
            setError('');
        } catch (err) {
            console.error("Failed to fetch users", err);
            setError('Failed to load users. You may not have permission.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/users/', {
                email,
                password,
                full_name: fullName,
                is_superuser: isSuperuser,
                is_active: true
            });
            setIsAdding(false);
            setEmail('');
            setPassword('');
            setFullName('');
            setIsSuperuser(false);
            fetchUsers();
        } catch (err: unknown) {
            const msg = (err as ApiError)?.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to create user');
        }
    };

    const handleDeleteUser = async (id: string) => {
        try {
            await api.delete(`/users/${id}`);
            setUsers(users.filter(u => u.id !== id));
            setConfirmDelete(null);
        } catch (err: unknown) {
            const msg = (err as ApiError)?.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to delete user');
            setConfirmDelete(null);
        }
    };

    const togglePwRow = (userId: string) => {
        if (expandedPwRow === userId) {
            setExpandedPwRow(null);
            setPwForm({ next: '', confirm: '' });
            setPwMsg(null);
        } else {
            setExpandedPwRow(userId);
            setPwForm({ next: '', confirm: '' });
            setPwMsg(null);
        }
    };

    const handleResetPassword = async (userId: string) => {
        if (pwForm.next !== pwForm.confirm) {
            setPwMsg({ text: 'Passwords do not match.', type: 'error' });
            return;
        }
        if (!pwForm.next) {
            setPwMsg({ text: 'Password cannot be empty.', type: 'error' });
            return;
        }
        setPwSaving(true);
        setPwMsg(null);
        try {
            await api.put(`/users/${userId}/password`, { new_password: pwForm.next });
            toast.success('Password reset successfully.');
            setExpandedPwRow(null);
            setPwForm({ next: '', confirm: '' });
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            let msg = 'Failed to reset password.';
            if (typeof detail === 'string') msg = detail;
            else if (Array.isArray(detail) && detail.length > 0) msg = detail[0].msg.replace(/^Value error, /, '');
            setPwMsg({ text: msg, type: 'error' });
        } finally {
            setPwSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    if (!currentUser?.is_superuser) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                <Shield className="h-16 w-16 text-yellow-500/50 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                <p className="text-gray-400">You must be a superuser to access this page.</p>
            </div>
        );
    }

    const offlineElectron = !isOnline && !!window.electronAPI;

    return (
        <><div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <UsersIcon className="h-6 w-6 text-brand-500" /> User Management
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Manage platform users and global administrators.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    disabled={offlineElectron}
                    className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={offlineElectron ? 'Requires connection' : undefined}
                >
                    {offlineElectron ? <WifiOff className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    {isAdding ? 'Cancel' : 'Add User'}
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-start flex-1">
                    <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {isAdding && (
                <div className="glass-panel p-6 rounded-xl border border-brand-500/30">
                    <h3 className="text-lg font-medium text-white mb-4">Create New User</h3>
                    <form onSubmit={handleAddUser} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Email / Username</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Temporary Password</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                />
                            </div>
                            <div className="md:col-span-2 flex items-center mt-2">
                                <input
                                    id="is_superuser"
                                    type="checkbox"
                                    checked={isSuperuser}
                                    onChange={(e) => setIsSuperuser(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-600 bg-black/40 text-brand-600 focus:ring-brand-600 focus:ring-offset-gray-900"
                                />
                                <label htmlFor="is_superuser" className="ml-2 block text-sm text-gray-300">
                                    Make this user a global Admin (Superuser)
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button type="submit" className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors">
                                Create User
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-panel rounded-xl">
                <div className="overflow-x-auto rounded-xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-dark-border bg-black/20">
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border">
                            {users.map((u) => (
                                <Fragment key={u.id}>
                                <tr className="hover:bg-white/5 transition-colors group">
                                    <td className="py-4 px-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-brand-900/50 flex items-center justify-center text-brand-400 font-bold mr-3 border border-brand-500/20">
                                                {u.full_name ? u.full_name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-white">{u.full_name || 'Unknown'}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 whitespace-nowrap text-sm text-gray-300">
                                        {u.email}
                                    </td>
                                    <td className="py-4 px-4 whitespace-nowrap">
                                        {u.is_superuser ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                <Shield className="w-3 h-3 mr-1" /> Superuser
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                                User
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => openMfaPanel(u.id)}
                                                disabled={offlineElectron}
                                                className={`p-2 rounded-lg transition-colors ${mfaUserId === u.id ? 'text-brand-400 bg-brand-500/10' : 'text-gray-500 hover:text-brand-400 hover:bg-brand-500/10'} disabled:opacity-30`}
                                                title={offlineElectron ? 'Requires connection' : 'Manage MFA'}
                                            >
                                                <ShieldCheck className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => togglePwRow(u.id)}
                                                disabled={u.id === currentUser?.id || offlineElectron}
                                                className="text-gray-500 hover:text-brand-400 p-2 rounded-lg hover:bg-brand-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                title={u.id === currentUser?.id ? 'Cannot reset your own password here' : offlineElectron ? 'Requires connection' : 'Reset Password'}
                                            >
                                                {offlineElectron && u.id !== currentUser?.id ? <WifiOff className="h-4 w-4" /> : <Key className="h-4 w-4" />}
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete({ id: u.id, name: u.full_name || u.email })}
                                                disabled={u.id === currentUser?.id}
                                                className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                title={u.id === currentUser?.id ? "Cannot delete yourself" : "Delete User"}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {expandedPwRow === u.id && (
                                    <tr className="bg-brand-900/10 border-b border-brand-500/10">
                                        <td colSpan={4} className="px-4 py-4">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                                                <div className="flex items-center gap-2 text-sm text-gray-400 mr-2 whitespace-nowrap self-center">
                                                    <Key className="h-4 w-4 text-brand-400" />
                                                    Reset password for <span className="text-white font-medium">{u.full_name || u.email}</span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                                                    <input
                                                        type="password"
                                                        placeholder="New password"
                                                        value={pwForm.next}
                                                        onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                                                        className="px-3 py-1.5 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white text-sm w-full sm:w-48"
                                                    />
                                                    <input
                                                        type="password"
                                                        placeholder="Confirm password"
                                                        value={pwForm.confirm}
                                                        onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                                                        className="px-3 py-1.5 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white text-sm w-full sm:w-48"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {pwMsg && (
                                                        <span className={`text-xs ${pwMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{pwMsg.text}</span>
                                                    )}
                                                    <button
                                                        onClick={() => handleResetPassword(u.id)}
                                                        disabled={pwSaving}
                                                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        {pwSaving ? 'Saving...' : 'Set Password'}
                                                    </button>
                                                    <button
                                                        onClick={() => togglePwRow(u.id)}
                                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {mfaUserId === u.id && (
                                    <tr className="bg-brand-900/10 border-b border-brand-500/10">
                                        <td colSpan={4} className="px-4 py-4">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-sm text-gray-400">
                                                        <ShieldCheck className="h-4 w-4 text-brand-400" />
                                                        MFA for <span className="text-white font-medium">{u.full_name || u.email}</span>
                                                    </div>
                                                    <button onClick={() => { setMfaUserId(null); setMfaStatus(null); }} className="text-gray-500 hover:text-gray-300 p-1">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                {mfaLoading ? (
                                                    <div className="flex justify-center py-4">
                                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-500"></div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {/* TOTP Devices */}
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Authenticator Apps</h4>
                                                            {mfaStatus?.totp.length === 0 ? (
                                                                <p className="text-xs text-gray-500">No authenticator app configured.</p>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    {mfaStatus?.totp.map(cred => (
                                                                        <div key={cred.id} className="flex items-center justify-between bg-black/20 border border-dark-border rounded-lg px-3 py-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                                                                                <span className="text-sm text-white">{cred.label || 'Authenticator'}</span>
                                                                                <span className="text-xs text-gray-500">{cred.created_date ? new Date(cred.created_date).toLocaleDateString() : ''}</span>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setDeletingCred({ id: cred.id, label: cred.label || 'Authenticator', userId: u.id })}
                                                                                className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                                                                                title="Remove"
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Passkeys */}
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Passkeys</h4>
                                                            {mfaStatus?.passkeys.length === 0 ? (
                                                                <p className="text-xs text-gray-500">No passkeys registered.</p>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    {mfaStatus?.passkeys.map(cred => (
                                                                        <div key={cred.id} className="flex items-center justify-between bg-black/20 border border-dark-border rounded-lg px-3 py-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <Fingerprint className="h-3.5 w-3.5 text-blue-400" />
                                                                                <span className="text-sm text-white">{cred.label || 'Passkey'}</span>
                                                                                <span className="text-xs text-gray-500">{cred.created_date ? new Date(cred.created_date).toLocaleDateString() : ''}</span>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setDeletingCred({ id: cred.id, label: cred.label || 'Passkey', userId: u.id })}
                                                                                className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                                                                                title="Remove"
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Require MFA toggle */}
                                                        <div className="flex items-center justify-between border-t border-dark-border pt-3 mt-3">
                                                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                                                <ShieldOff className="h-4 w-4" />
                                                                Require MFA setup on next login
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => handleToggleMfaRequirement(u.id, true)}
                                                                    disabled={togglingMfa}
                                                                    className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-500/20 transition-colors disabled:opacity-50"
                                                                >
                                                                    Require
                                                                </button>
                                                                <button
                                                                    onClick={() => handleToggleMfaRequirement(u.id, false)}
                                                                    disabled={togglingMfa}
                                                                    className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded-lg border border-red-500/20 transition-colors disabled:opacity-50"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                            ))}
                            {users.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <ConfirmDialog
            open={confirmDelete !== null}
            title="Delete User"
            message={`Are you sure you want to delete the user "${confirmDelete?.name}"? This action is permanent and cannot be undone.`}
            confirmText={confirmDelete?.name}
            onConfirm={() => confirmDelete && handleDeleteUser(confirmDelete.id)}
            onCancel={() => setConfirmDelete(null)}
        />

        <ConfirmDialog
            open={deletingCred !== null}
            title="Remove MFA Credential"
            message={`Remove "${deletingCred?.label}" from this user? They may lose access if no other authentication method remains.`}
            confirmLabel="Remove"
            onConfirm={handleDeleteCredential}
            onCancel={() => setDeletingCred(null)}
        />
        </>
    );
}
