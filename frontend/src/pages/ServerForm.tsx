import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { ArrowLeft, Server } from 'lucide-react';

export function ServerForm() {
    const navigate = useNavigate();
    const { serverId } = useParams();
    const isEditMode = Boolean(serverId);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);

    // Server payload includes default credentials
    const [formData, setFormData] = useState({
        name: '',
        ip_address: '',
        os: '',
        region: '',
        username: '',
        password: '',
        ssh_key: ''
    });

    useEffect(() => {
        if (isEditMode) {
            api.get(`/servers/${serverId}`)
                .then(res => {
                    setFormData({
                        name: res.data.name || '',
                        ip_address: res.data.ip_address || '',
                        os: res.data.os || '',
                        region: res.data.region || '',
                        username: res.data.username || '',
                        password: res.data.password || '',
                        ssh_key: res.data.ssh_key || ''
                    });
                })
                .catch(err => console.error("Failed to fetch server for editing", err))
                .finally(() => setInitialLoading(false));
        }
    }, [serverId, isEditMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isEditMode) {
                await api.put(`/servers/${serverId}`, formData);
            } else {
                await api.post('/servers/', formData);
            }
            navigate(`/servers`);
        } catch (err) {
            console.error("Failed to save server", err);
            alert("Error saving server.");
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
            <Link to={`/servers`} className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Servers
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <Server className="h-6 w-6 text-brand-500" /> {isEditMode ? 'Edit Global Server' : 'Add Global Server'}
                </h1>
                <p className="text-sm text-gray-400 mt-1">{isEditMode ? 'Update this server details.' : 'Register a new global compute server.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Server Name *</label>
                    <input required type="text"
                        value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="e.g. Primary App Server" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">IP Address / Hostname *</label>
                        <input required type="text"
                            value={formData.ip_address} onChange={e => setFormData({ ...formData, ip_address: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono"
                            placeholder="e.g. 192.168.1.100" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Operating System</label>
                        <input type="text"
                            value={formData.os} onChange={e => setFormData({ ...formData, os: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                            placeholder="e.g. Ubuntu 22.04 LTS" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Region / Location</label>
                    <input type="text"
                        value={formData.region} onChange={e => setFormData({ ...formData, region: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="e.g. AWS us-east-1" />
                </div>

                <div className="pt-4 border-t border-dark-border">
                    <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Authentication Credentials</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                            <input type="text"
                                value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                placeholder="e.g. root" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                            <input type="password"
                                value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                placeholder="••••••••••••" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">SSH Key (Optional)</label>
                        <textarea rows={3}
                            value={formData.ssh_key} onChange={e => setFormData({ ...formData, ssh_key: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono text-xs"
                            placeholder="-----BEGIN OPENSSH RSA KEY-----\n..." />
                    </div>
                </div>

                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button type="submit" disabled={loading} className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors">
                        {loading ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Add Server')}
                    </button>
                </div>
            </form>
        </div>
    );
}
