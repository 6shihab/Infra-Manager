import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users as UsersIcon, PlusCircle, Trash2, Shield, AlertCircle, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Group {
    id: number;
    name: string;
    description: string;
    users?: { id: number, email: string, full_name: string }[];
}

interface User {
    id: number;
    email: string;
    full_name: string;
}

export function Groups() {
    const { user: currentUser } = useAuth();
    const [groups, setGroups] = useState<Group[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Form state
    const [isAdding, setIsAdding] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    // Assign User State
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [selectedUserToAdd, setSelectedUserToAdd] = useState<string>('');

    useEffect(() => {
        if (currentUser?.is_superuser) {
            fetchGroups();
            fetchAllUsers();
        } else {
            setLoading(false);
        }
    }, [currentUser]);

    const fetchGroups = async () => {
        try {
            const res = await axios.get('http://localhost:8000/groups/');
            setGroups(res.data);
            setError('');
        } catch (err) {
            console.error("Failed to fetch groups", err);
            setError('Failed to load groups. You may not have permission.');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllUsers = async () => {
        try {
            const res = await axios.get('http://localhost:8000/users/');
            setAllUsers(res.data.map((u: any) => ({ id: u.id, email: u.email, full_name: u.full_name })));
        } catch (err) {
            console.error("Failed to fetch users for assignment dropdown", err);
        }
    };

    const handleAddGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:8000/groups/', {
                name,
                description
            });
            setIsAdding(false);
            setName('');
            setDescription('');
            fetchGroups(); // Refresh list to get relationships if backend populates them
        } catch (err: any) {
            const msg = err.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to create group');
        }
    };

    const handleDeleteGroup = async (id: number) => {
        if (!confirm('Are you sure you want to delete this group? This will remove all project access associated with it.')) return;

        try {
            await axios.delete(`http://localhost:8000/groups/${id}`);
            setGroups(groups.filter(g => g.id !== id));
        } catch (err: any) {
            const msg = err.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to delete group');
        }
    };

    const handleAssignUser = async (groupId: number) => {
        if (!selectedUserToAdd) return;

        try {
            await axios.post(`http://localhost:8000/groups/${groupId}/users/${selectedUserToAdd}`);
            setSelectedGroup(null);
            setSelectedUserToAdd('');
            fetchGroups(); // Refresh to show new user in the group list
        } catch (err: any) {
            const msg = err.response?.data?.detail;
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg) || 'Failed to assign user to group');
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
                <p className="text-gray-400">You must be a superuser to access Group Management.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <UsersIcon className="h-6 w-6 text-brand-500" /> Group Management
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Create Access Control groups and assign users to them.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-brand-500/20"
                >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    {isAdding ? 'Cancel' : 'Create Group'}
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
                    <h3 className="text-lg font-medium text-white mb-4">Create New Group</h3>
                    <form onSubmit={handleAddGroup} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="e.g. Frontend Team"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="Members of the frontend development squad"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button type="submit" className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors">
                                Create Group
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map((group) => (
                    <div key={group.id} className="glass-panel rounded-xl overflow-hidden hover:border-brand-500/30 transition-colors duration-300 flex flex-col group">
                        <div className="p-5 flex-1 relative">
                            <button
                                onClick={() => handleDeleteGroup(group.id)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                title="Delete Group"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                            <h3 className="text-lg font-bold text-white mb-1 pr-8">{group.name}</h3>
                            <p className="text-sm text-gray-400 mb-4">{group.description || 'No description provided.'}</p>

                            <div className="border-t border-dark-border pt-4">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Members ({group.users?.length || 0})</h4>
                                {group.users && group.users.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {group.users.map(u => (
                                            <div key={u.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-black/40 text-gray-300 border border-dark-border" title={u.email}>
                                                {u.full_name || u.email.split('@')[0]}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-500 italic">No users in this group.</span>
                                )}
                            </div>
                        </div>

                        <div className="bg-black/20 p-4 border-t border-dark-border">
                            {selectedGroup === group.id ? (
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedUserToAdd}
                                        onChange={(e) => setSelectedUserToAdd(e.target.value)}
                                        className="flex-1 px-3 py-1.5 text-sm bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    >
                                        <option value="">Select User...</option>
                                        {allUsers.filter(u => !group.users?.some(gu => gu.id === u.id)).map(u => (
                                            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleAssignUser(group.id)}
                                        disabled={!selectedUserToAdd}
                                        className="px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-50"
                                    >
                                        Add
                                    </button>
                                    <button
                                        onClick={() => { setSelectedGroup(null); setSelectedUserToAdd(''); }}
                                        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setSelectedGroup(group.id)}
                                    className="w-full inline-flex justify-center items-center py-2 px-4 border border-dark-border rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                                >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Assign User
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {groups.length === 0 && !loading && (
                    <div className="col-span-full border-2 border-dashed border-dark-border rounded-xl p-12 text-center">
                        <UsersIcon className="h-10 w-10 text-brand-500/50 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-300">No Groups Found</h3>
                        <p className="text-sm text-gray-500 mt-1">Create a group to start managing project access.</p>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="mt-4 inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <PlusCircle className="h-4 w-4 mr-2 text-brand-200" /> Create Group
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
