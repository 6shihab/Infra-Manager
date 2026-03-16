import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Users as UsersIcon, UserPlus, Trash2, Shield, AlertCircle, WifiOff, Key, ShieldOff, Fingerprint } from 'lucide-react';
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
    totp_enabled?: boolean;
    has_passkeys?: boolean;
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

    // Disable 2FA confirm state
    const [confirm2faDisable, setConfirm2faDisable] = useState<{ id: string; name: string } | null>(null);
    const [disabling2fa, setDisabling2fa] = useState(false);

    // Remove passkeys confirm state
    const [confirmPasskeyRemove, setConfirmPasskeyRemove] = useState<{ id: string; name: string } | null>(null);
    const [removingPasskeys, setRemovingPasskeys] = useState(false);

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

    const handleAdminDisable2fa = async (userId: string) => {
        setDisabling2fa(true);
        try {
            await api.delete(`/auth/totp/admin/${userId}`);
            toast.success('Two-factor authentication disabled for user.');
            setConfirm2faDisable(null);
            fetchUsers();
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to disable 2FA.');
            setConfirm2faDisable(null);
        } finally {
            setDisabling2fa(false);
        }
    };

    const handleAdminRemovePasskeys = async (userId: string) => {
        setRemovingPasskeys(true);
        try {
            await api.delete(`/auth/webauthn/admin/${userId}`);
            toast.success('Passkeys removed for user.');
            setConfirmPasskeyRemove(null);
            fetchUsers();
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to remove passkeys.');
            setConfirmPasskeyRemove(null);
        } finally {
            setRemovingPasskeys(false);
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

            <div className="glass-panel overflow-hidden rounded-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-dark-border bg-black/20">
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Role</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">2FA</th>
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border">
                            {users.map((u) => (
                                <>
                                <tr key={u.id} className="hover:bg-white/5 transition-colors group">
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
                                    <td className="py-4 px-4 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {u.totp_enabled && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <Shield className="w-3 h-3 mr-1" /> TOTP
                                                </span>
                                            )}
                                            {u.has_passkeys && (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                                    <Fingerprint className="w-3 h-3 mr-1" /> Passkey
                                                </span>
                                            )}
                                            {!u.totp_enabled && !u.has_passkeys && (
                                                <span className="text-xs text-gray-600">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => togglePwRow(u.id)}
                                                disabled={u.id === currentUser?.id || offlineElectron}
                                                className="text-gray-500 hover:text-brand-400 p-2 rounded-lg hover:bg-brand-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                title={u.id === currentUser?.id ? 'Cannot reset your own password here' : offlineElectron ? 'Requires connection' : 'Reset Password'}
                                            >
                                                {offlineElectron && u.id !== currentUser?.id ? <WifiOff className="h-4 w-4" /> : <Key className="h-4 w-4" />}
                                            </button>
                                            {u.totp_enabled && (
                                                <button
                                                    onClick={() => setConfirm2faDisable({ id: u.id, name: u.full_name || u.email })}
                                                    disabled={u.id === currentUser?.id || offlineElectron}
                                                    className="text-gray-500 hover:text-orange-400 p-2 rounded-lg hover:bg-orange-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                    title={u.id === currentUser?.id ? 'Use Settings to manage your own 2FA' : offlineElectron ? 'Requires connection' : 'Disable TOTP'}
                                                >
                                                    <ShieldOff className="h-4 w-4" />
                                                </button>
                                            )}
                                            {u.has_passkeys && (
                                                <button
                                                    onClick={() => setConfirmPasskeyRemove({ id: u.id, name: u.full_name || u.email })}
                                                    disabled={u.id === currentUser?.id || offlineElectron}
                                                    className="text-gray-500 hover:text-orange-400 p-2 rounded-lg hover:bg-orange-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                                    title={u.id === currentUser?.id ? 'Use Settings to manage your own passkeys' : offlineElectron ? 'Requires connection' : 'Remove Passkeys'}
                                                >
                                                    <Fingerprint className="h-4 w-4" />
                                                </button>
                                            )}
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
                                    <tr key={`${u.id}-pw`} className="bg-brand-900/10 border-b border-brand-500/10">
                                        <td colSpan={5} className="px-4 py-4">
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
                                </>
                            ))}
                            {users.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
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
            message={`Are you sure you want to delete the user "${confirmDelete?.name}"? This action cannot be undone.`}
            confirmText={confirmDelete?.name}
            onConfirm={() => confirmDelete && handleDeleteUser(confirmDelete.id)}
            onCancel={() => setConfirmDelete(null)}
        />

        <ConfirmDialog
            open={confirm2faDisable !== null}
            title="Disable Two-Factor Authentication"
            message={`Disable 2FA for "${confirm2faDisable?.name}"? They will be able to log in with password only until they re-enable it.`}
            confirmLabel="Disable 2FA"
            loading={disabling2fa}
            onConfirm={() => confirm2faDisable && handleAdminDisable2fa(confirm2faDisable.id)}
            onCancel={() => setConfirm2faDisable(null)}
        />

        <ConfirmDialog
            open={confirmPasskeyRemove !== null}
            title="Remove Passkeys"
            message={`Remove all passkeys for "${confirmPasskeyRemove?.name}"? They will no longer be able to use passwordless sign-in.`}
            confirmLabel="Remove Passkeys"
            loading={removingPasskeys}
            onConfirm={() => confirmPasskeyRemove && handleAdminRemovePasskeys(confirmPasskeyRemove.id)}
            onCancel={() => setConfirmPasskeyRemove(null)}
        />
        </>
    );
}
