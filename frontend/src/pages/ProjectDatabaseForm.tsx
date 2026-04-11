import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { ArrowLeft, Database } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Select } from '../components/Select';
import type { DatabaseEngineListItem, ApiError } from '../types/api';

export function ProjectDatabaseForm() {
    const navigate = useNavigate();
    const { projectId } = useParams();
    const queryClient = useQueryClient();
    const toast = useToast();

    const [selectedDbEngineId, setSelectedDbEngineId] = useState<string>('');
    const [overrideCredentials, setOverrideCredentials] = useState(false);

    const [formData, setFormData] = useState({
        db_name: '',
        username: '',
        password: ''
    });

    const { data: globalEngines, isLoading: isLoadingEngines } = useQuery({
        queryKey: ['databases'],
        queryFn: async () => {
            const { data } = await api.get('/databases/');
            return data;
        }
    });

    const attachMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                database_engine_id: selectedDbEngineId,
                db_name: formData.db_name,
                ...(overrideCredentials ? { username: formData.username, password: formData.password } : {})
            };
            await api.post(`/projects/${projectId}/databases`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            toast.success('Database Engine attached to project successfully');
            navigate(`/projects/${projectId}`);
        },
        onError: (err: unknown) => {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to attach database engine');
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDbEngineId) {
            toast.error("Please select a database engine");
            return;
        }
        if (!formData.db_name) {
            toast.error("Please provide a Database Name");
            return;
        }
        attachMutation.mutate();
    };

    if (isLoadingEngines) {
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
                    <Database className="h-6 w-6 text-brand-500" /> Attach Global Database Engine
                </h1>
                <p className="text-sm text-gray-400 mt-1">Select an existing global database engine and create a project-specific logical database on it.</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Select Database Engine *</label>
                    <Select
                        value={selectedDbEngineId}
                        onChange={setSelectedDbEngineId}
                        options={globalEngines?.map((engine: DatabaseEngineListItem) => ({
                            value: String(engine.id),
                            label: `${engine.name} (${engine.engine} @ ${engine.host})`
                        })) ?? []}
                        placeholder="Select a global engine..."
                        className="w-full"
                    />
                    {globalEngines?.length === 0 && (
                        <p className="text-sm text-amber-400 mt-2">No global database engines available. <Link to="/databases/new" className="text-brand-400 hover:text-brand-300 underline">Create a new database engine</Link> first, then come back to attach it.</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Logical Database Name *</label>
                    <input type="text"
                        required
                        value={formData.db_name} onChange={e => setFormData({ ...formData, db_name: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="e.g. app_production_db" />
                </div>

                <div className="pt-4 border-t border-dark-border">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={overrideCredentials}
                            onChange={(e) => setOverrideCredentials(e.target.checked)}
                            className="form-checkbox text-brand-500 bg-black/30 border-dark-border rounded"
                        />
                        <span className="text-sm font-medium text-gray-300">Override Default Engine Credentials</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">Check this if this project has a specific user role/password on this engine.</p>
                </div>

                {overrideCredentials && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Project Specific User / Role</label>
                                <input type="text"
                                    value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="e.g. db_user_alpha" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Project Specific Password</label>
                                <input type="password"
                                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                    placeholder="Enter password" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button
                        type="submit"
                        disabled={attachMutation.isPending || !selectedDbEngineId}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {attachMutation.isPending ? 'Attaching...' : 'Attach Database'}
                    </button>
                </div>
            </form>
        </div>
    );
}
