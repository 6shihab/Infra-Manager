import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Users as UsersIcon, UserPlus, Trash2, Shield, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface User {
    id: number;
    email: string;
    full_name: string;
    is_active: boolean;
    is_superuser: boolean;
}

export function Users() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Form state
    const [isAdding, setIsAdding] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isSuperuser, setIsSuperuser] = useState(false);

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
        } catch (err: any) {
            const msg = err.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to create user');
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            await api.delete(`/users/${id}`);
            setUsers(users.filter(u => u.id !== id));
        } catch (err: any) {
            const msg = err.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to delete user');
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

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <UsersIcon className="h-6 w-6 text-brand-500" /> User Management
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Manage platform users and global administrators.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-500/20"
                >
                    <UserPlus className="h-4 w-4 mr-2" />
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
                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border">
                            {users.map((u) => (
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
                                    <td className="py-4 px-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDeleteUser(u.id)}
                                            disabled={u.id === currentUser?.id}
                                            className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 tooltip-trigger relative"
                                            title={u.id === currentUser?.id ? "Cannot delete yourself" : "Delete User"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
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
    );
}
