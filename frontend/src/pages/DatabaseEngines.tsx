import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Database as DatabaseIcon, Trash2, Edit } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { DatabaseEngineListItem, ApiError } from '../types/api';

export function DatabaseEngines() {
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
    const queryClient = useQueryClient();
    const toast = useToast();
    const canEdit = (engine: DatabaseEngineListItem) => engine.can_edit === true;
    const canDelete = (engine: DatabaseEngineListItem) => engine.can_delete === true;

    const { data: engines, isLoading } = useQuery({
        queryKey: ['databases'],
        queryFn: async () => {
            const { data } = await api.get('/databases/');
            return data;
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/databases/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['databases'] });
            toast.success('Database Engine deleted successfully');
        },
        onError: (err: unknown) => {
            const detail = (err as ApiError)?.response?.data?.detail || 'Failed to delete engine';
            toast.error(typeof detail === 'string' ? detail : 'Failed to delete engine');
        }
    });

    const filteredEngines = useMemo(() => {
        if (!engines) return [];
        return engines.filter((engine: DatabaseEngineListItem) => {
            const query = searchQuery.toLowerCase();
            return !query ||
                engine.name.toLowerCase().includes(query) ||
                engine.engine.toLowerCase().includes(query) ||
                engine.host.toLowerCase().includes(query);
        });
    }, [engines, searchQuery]);

    if (isLoading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="h-7 w-44 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
                    </div>
                    <div className="h-9 w-32 bg-white/5 rounded-lg animate-pulse" />
                </div>
                <div className="h-9 w-full max-w-md bg-white/5 rounded-lg animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="glass-panel rounded-xl border border-dark-border overflow-hidden animate-pulse">
                            <div className="p-5 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-white/5 shrink-0" />
                                    <div className="space-y-2 flex-1">
                                        <div className="h-4 w-2/3 bg-white/5 rounded" />
                                        <div className="h-3 w-1/2 bg-white/5 rounded" />
                                    </div>
                                </div>
                                <div className="space-y-2 pt-2">
                                    <div className="h-3 bg-white/5 rounded w-full" />
                                    <div className="h-3 bg-white/5 rounded w-4/5" />
                                    <div className="h-3 bg-white/5 rounded w-3/5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Database Engines</h1>
                    <p className="text-sm text-gray-400 mt-1">Manage your global database servers and clusters.</p>
                </div>
                <Link to="/databases/new" className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors">
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    Add DB Engine
                </Link>
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 max-w-md min-w-0">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-dark-border rounded-lg leading-5 bg-black/20 text-gray-300 placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm transition-all"
                        placeholder="Search engines by name, type, or host..."
                    />
                </div>
            </div>

            {filteredEngines.length === 0 ? (
                <div className="text-center py-12 bg-dark-card/30 rounded-xl border border-dark-border">
                    <DatabaseIcon className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-1">No database engines found</h3>
                    <p className="text-gray-400">Add a global database engine to get started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEngines.map((engine: DatabaseEngineListItem) => (
                        <div key={engine.id} className="group flex flex-col glass-panel rounded-xl overflow-hidden border border-dark-border hover:border-brand-500/50 transition-all duration-300">
                            <div className="p-5 flex-1 relative">
                                {(canEdit(engine) || canDelete(engine)) && (
                                    <div className="absolute top-4 right-4 flex space-x-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        {canEdit(engine) && (
                                            <Link to={`/databases/${engine.id}/edit`} className="p-1.5 text-gray-400 hover:text-white bg-black/50 hover:bg-brand-500/20 rounded-lg transition-colors">
                                                <Edit className="h-4 w-4" />
                                            </Link>
                                        )}
                                        {canDelete(engine) && (
                                            <button
                                                onClick={() => setConfirmDelete({ id: engine.id, name: engine.name })}
                                                className="p-1.5 text-gray-400 hover:text-red-400 bg-black/50 hover:bg-red-500/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center mb-4">
                                    <div className="p-2.5 bg-brand-500/10 rounded-lg mr-4">
                                        <DatabaseIcon className="h-6 w-6 text-brand-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white">{engine.name}</h3>
                                        <p className="text-sm text-gray-400 font-mono mt-1">{engine.engine}</p>
                                    </div>
                                </div>

                                <div className="space-y-2 mt-4 text-sm">
                                    <div className="flex justify-between items-center text-gray-400">
                                        <span>Host</span>
                                        <span className="text-gray-200 font-mono text-xs max-w-[150px] truncate">{engine.host}:{engine.port}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-400">
                                        <span>Default User</span>
                                        <span className="text-gray-200">{engine.username || 'None'}</span>
                                    </div>
                                    {engine.connection_string_format && (
                                        <div className="text-xs text-gray-500 mt-2 font-mono truncate border font-mono p-1 rounded bg-black/20 border-white/5">
                                            {engine.connection_string_format}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={confirmDelete !== null}
                title="Delete Database Engine"
                message={`Are you sure you want to delete the database engine "${confirmDelete?.name}"? This action cannot be undone.`}
                confirmText={confirmDelete?.name}
                loading={deleteMutation.isPending}
                onConfirm={() => { deleteMutation.mutate(confirmDelete!.id); setConfirmDelete(null); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
}
