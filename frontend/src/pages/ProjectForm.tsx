import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { ArrowLeft, Save } from 'lucide-react';

export function ProjectForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = Boolean(id);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        primary_domain: '',
        environment: 'Dev'
    });

    useEffect(() => {
        if (isEditMode) {
            api.get(`/projects/${id}`)
                .then(res => {
                    setFormData({
                        name: res.data.name || '',
                        description: res.data.description || '',
                        primary_domain: res.data.primary_domain || '',
                        environment: res.data.environment || 'Dev'
                    });
                })
                .catch(err => console.error("Failed to fetch project for editing", err))
                .finally(() => setInitialLoading(false));
        }
    }, [id, isEditMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isEditMode) {
                await api.put(`/projects/${id}`, formData);
                navigate(`/projects/${id}`);
            } else {
                const res = await api.post('/projects/', formData);
                navigate(`/projects/${res.data.id}`);
            }
        } catch (err) {
            console.error("Failed to save project", err);
            alert("Error saving project.");
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
            <Link to="/projects" className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{isEditMode ? 'Edit Project' : 'Create New Project'}</h1>
                <p className="text-sm text-gray-400 mt-1">{isEditMode ? 'Update your architecture project details.' : 'Add a new architecture project to your dashboard.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-5">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Project Name *</label>
                    <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500"
                        placeholder="e.g. Core API Service"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500"
                        placeholder="Describe the purpose of this project..."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Environment</label>
                        <select
                            value={formData.environment}
                            onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white appearance-none"
                        >
                            <option value="Dev">Development (Dev)</option>
                            <option value="Staging">Staging</option>
                            <option value="Prod">Production (Prod)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Primary Domain</label>
                        <input
                            type="text"
                            value={formData.primary_domain}
                            onChange={(e) => setFormData({ ...formData, primary_domain: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500"
                            placeholder="e.g. api.example.com"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Project
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
