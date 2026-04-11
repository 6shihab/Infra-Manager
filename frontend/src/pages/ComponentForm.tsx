import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, Layers } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../components/Toast';

interface CustomField {
    key: string;
    value: string;
}

export function ComponentForm() {
    const { projectId, componentId } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(componentId);
    const toast = useToast();

    const [name, setName] = useState('');
    const [type, setType] = useState(''); // Default empty to allow any type
    const [customFields, setCustomFields] = useState<CustomField[]>([{ key: '', value: '' }]);

    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(isEditMode);

    // Built-in component types suggestions
    const commonTypes = ['S3 Bucket', 'Redis Cache', 'Message Queue', 'DNS Record', 'CDN Distribution', 'Load Balancer'];

    useEffect(() => {
        if (isEditMode) {
            api.get(`/components/${componentId}`)
                .then(res => {
                    setName(res.data.name);
                    setType(res.data.type);

                    const fields = res.data.custom_fields || {};
                    const fieldsArr = Object.entries(fields).map(([k, v]) => ({ key: k, value: String(v) }));

                    if (fieldsArr.length > 0) {
                        setCustomFields(fieldsArr);
                    } else {
                        setCustomFields([{ key: '', value: '' }]); // Fallback empty row
                    }
                })
                .catch(err => {
                    console.error("Failed to load component details", err);
                    toast.error("Component not found");
                    navigate(`/projects/${projectId}`);
                })
                .finally(() => setLoading(false));
        }
    }, [componentId, isEditMode, projectId, navigate]);

    const handleAddField = () => {
        setCustomFields([...customFields, { key: '', value: '' }]);
    };

    const handleRemoveField = (index: number) => {
        if (customFields.length > 1) {
            setCustomFields(customFields.filter((_, i) => i !== index));
        }
    };

    const handleFieldChange = (index: number, field: 'key' | 'value', val: string) => {
        const newFields = [...customFields];
        newFields[index][field] = val;
        setCustomFields(newFields);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        // Convert array mapping to a clean dictionary object for JSON submission
        const fieldsDict: Record<string, string> = {};
        customFields.forEach(f => {
            if (f.key.trim() !== '') {
                fieldsDict[f.key.trim()] = f.value;
            }
        });

        const payload = {
            name,
            type,
            custom_fields: fieldsDict,
            project_id: projectId
        };

        try {
            if (isEditMode) {
                await api.put(`/components/${componentId}`, payload);
            } else {
                await api.post('/components/', payload);
            }
            navigate(`/projects/${projectId}`);
        } catch (err) {
            console.error(err);
            toast.error("An error occurred while saving the component.");
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
            <Link to={`/projects/${projectId}`} className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Project
            </Link>

            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    <Layers className="h-6 w-6 text-brand-500" />
                    {isEditMode ? 'Edit Component' : 'Add New Component'}
                </h1>
                <p className="text-sm text-gray-400 mt-1">Define arbitrary infrastructure pieces using custom dynamic fields.</p>
            </div>

            <form onSubmit={handleSubmit} className="glass-panel p-6 sm:p-8 rounded-xl space-y-8">
                {/* Core Attributes */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium text-white mb-4">Core Attributes</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Component Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Primary Backup Bucket"
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Component Type</label>
                                <input
                                    type="text"
                                    required
                                    list="type-suggestions"
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    placeholder="e.g. S3 Bucket, Redis Cache..."
                                    className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors"
                                />
                                <datalist id="type-suggestions">
                                    {commonTypes.map(t => <option key={t} value={t} />)}
                                </datalist>
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="border-dark-border" />

                {/* Custom Fields Builder */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between pointer-events-none">
                        <h3 className="text-lg font-medium text-white">Custom Fields</h3>
                        <span className="text-xs text-brand-500 pointer-events-auto bg-brand-500/10 px-2.5 py-1 rounded-md border border-brand-500/20">JSON Backed</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">Add arbitrary key-value pairs (e.g. `Region: us-east-1`, `EngineVersion: 7.0.2`)</p>

                    <div className="space-y-3">
                        {customFields.map((field, index) => (
                            <div key={index} className="flex items-center gap-3 animate-in slide-in-from-left-4 duration-300">
                                <input
                                    type="text"
                                    value={field.key}
                                    onChange={(e) => handleFieldChange(index, 'key', e.target.value)}
                                    placeholder="Field Key (e.g. Region)"
                                    className="w-1/3 px-4 py-2 bg-black/30 border border-dark-border focus:border-brand-500 rounded-lg text-white"
                                />
                                <input
                                    type="text"
                                    value={field.value}
                                    onChange={(e) => handleFieldChange(index, 'value', e.target.value)}
                                    placeholder="Value (e.g. us-east-1)"
                                    className="flex-1 px-4 py-2 bg-black/30 border border-dark-border focus:border-brand-500 rounded-lg text-white font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveField(index)}
                                    className="p-2 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                                    title="Remove Field"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleAddField}
                        className="mt-4 flex items-center text-sm font-medium text-brand-500 hover:text-brand-400 hover:bg-brand-500/10 px-3 py-1.5 rounded-lg border border-transparent transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add Field
                    </button>
                </div>

                <div className="pt-6 mt-6 border-t border-dark-border flex items-center justify-end gap-3">
                    <Link
                        to={`/projects/${projectId}`}
                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent hover:bg-white/5 border border-transparent rounded-lg transition-colors"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center justify-center px-6 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-colors disabled:opacity-50"
                    >
                        {submitting ? 'Saving...' : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                {isEditMode ? 'Save Changes' : 'Create Component'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
