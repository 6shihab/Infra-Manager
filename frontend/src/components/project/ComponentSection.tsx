import { Link } from 'react-router-dom';
import { Layers, Info, Trash2 } from 'lucide-react';
import { SecretField } from '../SecretField';

interface ComponentData {
    id: string;
    name: string;
    type: string;
    custom_fields: Record<string, unknown>;
}

interface ComponentSectionProps {
    projectId: string;
    components: ComponentData[];
    canEdit: boolean;
    canDelete: boolean;
    onDeleteComponent: (compId: string, compName: string) => void;
}

export function ComponentSection({ projectId, components, canEdit, canDelete, onDeleteComponent }: ComponentSectionProps) {
    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                    <Layers className="mr-2 h-5 w-5 text-brand-500" />
                    Other Infrastructure ({components?.length || 0})
                </h2>
                {canEdit && <Link to={`/projects/${projectId}/components/new`} className="text-sm text-brand-500 hover:text-brand-400">Add Component</Link>}
            </div>

            {components?.length === 0 && <p className="text-gray-500 text-sm">No custom infrastructure components linked yet.</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {components?.map((comp) => (
                    <div key={comp.id} className="glass-panel p-5 rounded-xl border-t-2 border-t-brand-500/50 hover:border-brand-500 transition-colors duration-300">
                        <div className="flex items-start justify-between mb-3">
                            <div className="min-w-0 flex-1 mr-2">
                                <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1">{comp.type}</div>
                                <div className="text-lg font-bold text-white leading-tight truncate">{comp.name}</div>
                            </div>
                            <div className="flex gap-2">
                                {canEdit && (
                                    <Link to={`/projects/${projectId}/components/${comp.id}/edit`} className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-md transition" title="Edit Component">
                                        <Info className="w-4 h-4" />
                                    </Link>
                                )}
                                {canDelete && (
                                    <button onClick={() => onDeleteComponent(comp.id, comp.name)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition" title="Delete Component">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {Object.keys(comp.custom_fields || {}).length > 0 ? (
                            <div className="mt-4 bg-black/20 rounded-lg text-sm overflow-hidden border border-dark-border">
                                {Object.entries(comp.custom_fields).map(([k, v]) => (
                                    <SecretField key={k} label={k} isCustomField={true} customValue={String(v)} />
                                ))}
                            </div>
                        ) : (
                            <div className="mt-4 text-xs text-gray-500 italic">No custom attributes defined.</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
