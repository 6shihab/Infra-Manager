import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { ArrowLeft, Database } from 'lucide-react';

export function DatabaseForm() {
    const navigate = useNavigate();
    const { databaseId } = useParams();
    const isEditMode = Boolean(databaseId);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);
    const queryClient = useQueryClient();

    // Database payload includes default credentials
    const [formData, setFormData] = useState({
        name: '',
        engine: 'PostgreSQL 16',
        host: '',
        port: 5432,
        connection_string_format: '',
        username: '',
        password: ''
    });

    useEffect(() => {
        if (isEditMode) {
            api.get(`/databases/${databaseId}`)
                .then(res => {
                    setFormData({
                        name: res.data.name || '',
                        engine: res.data.engine || 'PostgreSQL 16',
                        host: res.data.host || '',
                        port: res.data.port || 5432,
                        connection_string_format: res.data.connection_string_format || '',
                        username: res.data.username || '',
                        password: res.data.password || ''
                    });
                })
                .catch(err => console.error("Failed to fetch database for editing", err))
                .finally(() => setInitialLoading(false));
        }
    }, [databaseId, isEditMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isEditMode) {
                await api.put(`/databases/${databaseId}`, formData);
            } else {
                await api.post('/databases/', formData);
            }
            await queryClient.invalidateQueries({ queryKey: ["databases"] });
            navigate(`/databases`);
        } catch (err) {
            console.error("Failed to save database engine", err);
            alert("Error saving database.");
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
            <Link to={`/databases`} className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Database Engines
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <Database className="h-6 w-6 text-brand-500" /> {isEditMode ? 'Edit Database Engine' : 'Add Database Engine'}
                </h1>
                <p className="text-sm text-gray-400 mt-1">{isEditMode ? 'Update this database engine connection details.' : 'Register a new global database engine.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-xl space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Engine Name *</label>
                    <input required type="text"
                        value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                        placeholder="e.g. Primary HA Database Cluster" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Database Engine</label>
                        <input
                            type="text"
                            list="engine-suggestions"
                            value={formData.engine}
                            onChange={e => setFormData({ ...formData, engine: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                            placeholder="e.g. PostgreSQL 16, MySQL 8, Redis..."
                        />
                        <datalist id="engine-suggestions">
                            <option value="PostgreSQL 16" />
                            <option value="PostgreSQL 15" />
                            <option value="MySQL 8.0" />
                            <option value="MySQL 5.7" />
                            <option value="MariaDB 11" />
                            <option value="MongoDB 7.0" />
                            <option value="Redis 7" />
                            <option value="SQLite 3" />
                            <option value="Microsoft SQL Server" />
                            <option value="Oracle DB" />
                            <option value="Cassandra" />
                            <option value="CockroachDB" />
                            <option value="Elasticsearch" />
                            <option value="ClickHouse" />
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Connection String Format (Optional)</label>
                        <input type="text"
                            value={formData.connection_string_format} onChange={e => setFormData({ ...formData, connection_string_format: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono text-sm"
                            placeholder="e.g. postgresql://{user}:{pass}@{host}:{port}/{db}" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Host / Endpoint *</label>
                        <input required type="text"
                            value={formData.host} onChange={e => setFormData({ ...formData, host: e.target.value })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono"
                            placeholder="e.g. db.internal.local" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
                        <input type="number"
                            value={formData.port} onChange={e => setFormData({ ...formData, port: Number(e.target.value) })}
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white font-mono"
                            placeholder="5432" />
                    </div>
                </div>

                <div className="pt-4 border-t border-dark-border">
                    <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Authentication</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Username / Role</label>
                            <input type="text"
                                value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                placeholder="e.g. db_admin" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                            <input type="password"
                                value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                                placeholder="••••••••••••" />
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-dark-border flex justify-end">
                    <button type="submit" disabled={loading} className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors">
                        {loading ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Add Database')}
                    </button>
                </div>
            </form>
        </div>
    );
}
