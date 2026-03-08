import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { ArrowLeft, Server } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function ProjectServerForm() {
    const navigate = useNavigate();
    const { projectId } = useParams();
    const queryClient = useQueryClient();

    const [selectedServerId, setSelectedServerId] = useState<number | ''>('');
    const [overrideCredentials, setOverrideCredentials] = useState(false);

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        ssh_key: ''
    });

    const { data: globalServers, isLoading: isLoadingServers } = useQuery({
        queryKey: ['servers'],
        queryFn: async () => {
            const { data } = await api.get('/servers/');
            return data;
        }
    });

    const attachMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                server_id: Number(selectedServerId),
                ...(overrideCredentials ? formData : {})
            };
            await api.post(`/projects/${projectId}/servers`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project', projectId] });
            toast.success('Server attached to project successfully');
            navigate(`/projects/${projectId}`);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to attach server');
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedServerId) {
            toast.error("Please select a server");
            return;
        }
        attachMutation.mutate();
    };

    if (isLoadingServers) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
            <Link to={`/projects/${projectId}`} className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Project
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <Server className="h-6 w-6 text-brand-500" /> Attach Global Server
                </h1>
                <p className="text-sm text-gray-400 mt-1">Select an existing global server to attach to this project.</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Server *</label>
                    <select
                        required
                        value={selectedServerId}
                        onChange={(e) => setSelectedServerId(Number(e.target.value))}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                    >
                        <option value="" disabled>Select a global server...</option>
                        {globalServers?.map((server: any) => (
                            <option key={server.id} value={server.id}>
                                {server.name} ({server.ip_address})
                            </option>
                        ))}
                    </select>
                    {globalServers?.length === 0 && (
                        <p className="text-sm text-red-400 mt-2">No global servers available. Please add one from the Servers page first.</p>
                    )}
                </div>

                <div className="pt-4 border-t border-dark-border">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={overrideCredentials}
                            onChange={(e) => setOverrideCredentials(e.target.checked)}
                            className="form-checkbox text-brand-500 bg-black/30 border-dark-border rounded"
                        />
                        <span className="text-sm font-medium text-gray-300">Override Default Server Credentials</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">Check this if this project uses a specific user/password/key on this server, rather than the global default.</p>
                </div>

                {overrideCredentials && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Project Specific Username</label>
                                <input type="text"
                                    value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="e.g. app_user" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Project Specific Password</label>
                                <input type="password"
                                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="••••••••••••" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Project Specific SSH Key</label>
                            <textarea rows={3}
                                value={formData.ssh_key} onChange={e => setFormData({ ...formData, ssh_key: e.target.value })}
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono text-xs"
                                placeholder="-----BEGIN OPENSSH RSA KEY-----\n..." />
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button
                        type="submit"
                        disabled={attachMutation.isPending || !selectedServerId}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {attachMutation.isPending ? 'Attaching...' : 'Attach Server'}
                    </button>
                </div>
            </form>
        </div>
    );
}
