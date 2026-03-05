import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Server, Database, KeySquare, Globe, ExternalLink, Activity, Info, Lock, Layers, Trash2, Shield, Plus, X, Copy, Check } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className={`p-1 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/10 ${className}`}
            title="Copy to clipboard"
        >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );
}

function SecretField({ username, password, ssh_key, label, isCustomField = false, customValue = "" }: { username?: string, password?: string, ssh_key?: string, label: string, isCustomField?: boolean, customValue?: string }) {
    const [revealed, setRevealed] = useState(false);

    return (
        <div className={`mt-3 flex items-start gap-4 p-3 bg-black/20 rounded-lg ${isCustomField ? 'border-b border-white/5 last:border-0 last:pb-3 pb-3 mt-0 mb-1 rounded-none px-2' : 'border border-dark-border'}`}>
            <div className={`text-sm text-gray-500 mt-1 flex items-center gap-2 ${isCustomField ? 'w-1/3 break-words' : 'w-24'}`}>
                {label}
                {isCustomField && revealed && <CopyButton text={customValue} />}
            </div>
            <div className="flex-1">
                {revealed ? (
                    <div className="space-y-2 animate-in fade-in">
                        {isCustomField ? (
                            <div className="text-sm text-white font-mono break-all">{customValue}</div>
                        ) : (
                            <>
                                {username && (
                                    <div className="flex items-center gap-2 text-sm text-white group">
                                        <span className="text-gray-400">User:</span> {username}
                                        <CopyButton text={username} className="opacity-0 group-hover:opacity-100" />
                                    </div>
                                )}
                                {password && (
                                    <div className="flex items-center gap-2 text-sm text-white font-mono break-all group">
                                        <span className="text-gray-400 font-sans">Pass:</span> {password}
                                        <CopyButton text={password} className="opacity-0 group-hover:opacity-100" />
                                    </div>
                                )}
                                {ssh_key && (
                                    <div className="relative group mt-1">
                                        <div className="text-xs text-gray-500 italic break-all font-mono pr-8">{ssh_key}</div>
                                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <CopyButton text={ssh_key} />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-gray-500 font-mono tracking-widest mt-1 opacity-50">
                        ••••••••••••••••
                    </div>
                )}
            </div>
            <button
                onClick={() => setRevealed(!revealed)}
                className="text-xs bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 px-3 py-1.5 rounded transition-colors flex items-center justify-center min-w-[80px]"
            >
                {revealed ? 'Hide' : 'Reveal'}
            </button>
        </div>
    );
}

export function ProjectDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Custom Modal State
    const [deleteConfig, setDeleteConfig] = useState<{ type: 'project' | 'server' | 'database' | 'component', id: number | null, title: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Access Control State
    const { user } = useAuth();
    const [allGroups, setAllGroups] = useState<any[]>([]);
    const [assigningGroup, setAssigningGroup] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [selectedAccessLevel, setSelectedAccessLevel] = useState('Viewer');

    useEffect(() => {
        if (user?.is_superuser) {
            axios.get('http://localhost:8000/groups/')
                .then(res => setAllGroups(res.data))
                .catch(err => console.error("Failed to fetch groups", err));
        }
    }, [user?.is_superuser]);

    const handleAssignGroup = async () => {
        if (!selectedGroupId) return;
        try {
            await axios.post(`http://localhost:8000/projects/${id}/groups/${selectedGroupId}?access_level=${selectedAccessLevel}`);
            // refresh project
            const res = await axios.get(`http://localhost:8000/projects/${id}`);
            setProject(res.data);
            setAssigningGroup(false);
            setSelectedGroupId('');
            setSelectedAccessLevel('Viewer');
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to assign group");
        }
    };

    const handleRemoveGroup = async (groupId: number) => {
        if (!confirm('Remove this group from the project?')) return;
        try {
            await axios.delete(`http://localhost:8000/projects/${id}/groups/${groupId}`);
            const res = await axios.get(`http://localhost:8000/projects/${id}`);
            setProject(res.data);
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to remove group");
        }
    }

    const executeDelete = async () => {
        if (!deleteConfig) return;
        setDeleting(true);
        try {
            if (deleteConfig.type === 'project') {
                await axios.delete(`http://localhost:8000/projects/${id}`);
                navigate('/projects');
            } else if (deleteConfig.type === 'server') {
                await axios.delete(`http://localhost:8000/servers/${deleteConfig.id}`);
                setProject({ ...project, servers: project.servers.filter((s: any) => s.id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'database') {
                await axios.delete(`http://localhost:8000/databases/${deleteConfig.id}`);
                setProject({ ...project, databases: project.databases.filter((db: any) => db.id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'component') {
                await axios.delete(`http://localhost:8000/components/${deleteConfig.id}`);
                setProject({ ...project, components: project.components.filter((c: any) => c.id !== deleteConfig.id) });
                setDeleteConfig(null);
            }
        } catch (err) {
            console.error(`Failed to delete ${deleteConfig.type}`, err);
            alert(`Error deleting ${deleteConfig.type}.`);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteProject = () => setDeleteConfig({ type: 'project', id: Number(id), title: 'Delete Project' });
    const handleDeleteServer = (serverId: number) => setDeleteConfig({ type: 'server', id: serverId, title: 'Delete Server' });
    const handleDeleteDatabase = (dbId: number) => setDeleteConfig({ type: 'database', id: dbId, title: 'Delete Database' });
    const handleDeleteComponent = (compId: number) => setDeleteConfig({ type: 'component', id: compId, title: 'Delete Component' });


    useEffect(() => {
        axios.get(`http://localhost:8000/projects/${id}`)
            .then(res => setProject(res.data))
            .catch(err => {
                console.error("Failed to load project from backend, falling back to mock", err);
                // Fallback Mock data for project #id
                setProject({
                    id: Number(id),
                    name: "Sample Project (Fallback)",
                    description: "Database might be empty or unavailable.",
                    environment: "Dev",
                    primary_domain: "dev.example.com",
                    servers: [
                        { id: 101, ip_address: "192.168.1.10", os: "Ubuntu 22.04 LTS", region: "AWS us-east-1", username: "root", password: "mockpassword1" }
                    ],
                    databases: [
                        { id: 201, engine: "PostgreSQL 15", host: "db.example.internal", port: 5432, db_name: "dev_db", username: "admin", password: "mockpassword2" }
                    ],
                    components: []
                });
            })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    if (!project) return <div className="text-white">Project not found</div>;

    return (
        <div className="space-y-6 pb-12 animate-in fade-in duration-300">
            <Link to="/projects" className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
            </Link>

            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-white tracking-tight">{project.name}</h1>
                        <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                            project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                            }`}>
                            {project.environment}
                        </span>
                    </div>
                    <p className="text-base text-gray-400 max-w-2xl">{project.description}</p>

                    <div className="mt-4 flex items-center gap-6">
                        {project.primary_domain && (
                            <div className="flex items-center text-sm text-gray-300 gap-2 group/domain">
                                <Globe className="mr-2 h-4 w-4 text-brand-500" />
                                <a href={`https://${project.primary_domain}`} target="_blank" rel="noreferrer" className="hover:text-brand-400 hover:underline inline-flex items-center">
                                    {project.primary_domain}
                                    <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                                <CopyButton text={project.primary_domain} className="opacity-0 group-hover/domain:opacity-100" />
                            </div>
                        )}
                        <div className="flex items-center text-sm text-gray-300">
                            <Activity className="mr-2 h-4 w-4 text-emerald-500" />
                            System Data Synced
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={handleDeleteProject} className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 transition">
                        Delete Project
                    </button>
                    <Link to={`/projects/${project.id}/edit`} className="px-4 py-2 bg-white/5 border border-dark-border text-white text-sm font-medium rounded-lg hover:bg-white/10 transition">
                        Edit Project
                    </Link>
                </div>
            </div>

            <hr className="border-dark-border my-6" />

            {/* Servers section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Server className="mr-2 h-5 w-5 text-brand-500" />
                        Compute Instances ({project.servers?.length || 0})
                    </h2>
                    <Link to={`/projects/${project.id}/servers/new`} className="text-sm text-brand-500 hover:text-brand-400">Add Server</Link>
                </div>

                {project.servers?.length === 0 && <p className="text-gray-500 text-sm">No servers linked to this project.</p>}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {project.servers?.map((server: any) => (
                        <div key={server.id} className="glass-panel p-5 rounded-xl">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-start gap-3 group/btn">
                                    <Server className="h-5 w-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h3 className="font-medium text-white group-hover/btn:text-brand-400 transition-colors flex items-center gap-2">
                                            {server.ip_address}
                                            <CopyButton text={server.ip_address} className="opacity-0 group-hover/btn:opacity-100" />
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                            {server.os && <span className="flex items-center"><Info className="w-3 h-3 mr-1" /> {server.os}</span>}
                                            {server.region && <span className="flex items-center"><Globe className="w-3 h-3 mr-1" /> {server.region}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-emerald-500/10 rounded-md cursor-help" title="Status: Healthy">
                                        <Activity className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <Link to={`/projects/${project.id}/servers/${server.id}/edit`} className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded-md transition border border-dark-border" title="Edit Server">
                                        Edit
                                    </Link>
                                    <button onClick={() => handleDeleteServer(server.id)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors" title="Delete Server">
                                        <Lock className="w-4 h-4" /> {/* Or better trash icon if imported, using Lock temporarily as substitute or just 'X' */}
                                        <span className="sr-only">Delete</span>
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-dark-border pt-4 mt-2">
                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                                    <Lock className="w-3 h-3 mr-1.5" /> Credentials
                                </div>
                                {(server.username || server.password || server.ssh_key) ? (
                                    <SecretField username={server.username} password={server.password} ssh_key={server.ssh_key} label="SSH / Root" />
                                ) : (
                                    <p className="text-sm text-gray-500 mt-2">No credentials attached.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Database section */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Database className="mr-2 h-5 w-5 text-brand-500" />
                        Databases ({project.databases?.length || 0})
                    </h2>
                    <Link to={`/projects/${project.id}/databases/new`} className="text-sm text-brand-500 hover:text-brand-400">Add Database</Link>
                </div>

                {project.databases?.length === 0 && <p className="text-gray-500 text-sm">No databases linked to this project.</p>}

                <div className="space-y-4">
                    {project.databases?.map((db: any) => (
                        <div key={db.id} className="glass-panel p-5 rounded-xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <div>
                                    <div className="text-lg font-semibold text-white mb-1 flex items-center gap-2 group/dbn">
                                        {db.db_name || 'Unnamed DB'}
                                        {db.db_name && <CopyButton text={db.db_name} className="opacity-0 group-hover/dbn:opacity-100" />}
                                    </div>
                                    <div className="text-sm text-gray-400 font-mono flex items-center gap-2 group/host">
                                        {db.host}:{db.port}
                                        <CopyButton text={`${db.host}:${db.port}`} className="opacity-0 group-hover/host:opacity-100" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="px-3 py-1 bg-brand-500/10 text-brand-400 rounded-lg text-sm font-medium border border-brand-500/20">
                                        {db.engine}
                                    </div>
                                    <Link to={`/projects/${project.id}/databases/${db.id}/edit`} className="text-xs text-white hover:text-gray-300 px-2 py-1 bg-white/5 hover:bg-white/10 border border-dark-border rounded">
                                        Edit
                                    </Link>
                                    <button onClick={() => handleDeleteDatabase(db.id)} className="text-xs text-red-500 hover:text-red-400 p-1 bg-red-500/10 hover:bg-red-500/20 rounded">
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-dark-border pt-4 mt-2">
                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center">
                                    <KeySquare className="w-3 h-3 mr-1.5" /> Authentication
                                </div>
                                {(db.username || db.password) ? (
                                    <SecretField username={db.username} password={db.password} label="Admin / Root" />
                                ) : (
                                    <p className="text-sm text-gray-500 mt-2">No credentials attached.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Custom Components section */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Layers className="mr-2 h-5 w-5 text-brand-500" />
                        Other Infrastructure ({project.components?.length || 0})
                    </h2>
                    <Link to={`/projects/${project.id}/components/new`} className="text-sm text-brand-500 hover:text-brand-400">Add Component</Link>
                </div>

                {project.components?.length === 0 && <p className="text-gray-500 text-sm">No custom infrastructure components linked yet.</p>}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {project.components?.map((comp: any) => (
                        <div key={comp.id} className="glass-panel p-5 rounded-xl border-t-2 border-t-brand-500/50 hover:border-brand-500 transition-colors duration-300">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1">{comp.type}</div>
                                    <div className="text-lg font-bold text-white leading-tight">{comp.name}</div>
                                </div>
                                <div className="flex gap-2">
                                    <Link to={`/projects/${project.id}/components/${comp.id}/edit`} className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-md transition" title="Edit Component">
                                        <Info className="w-4 h-4" />
                                    </Link>
                                    <button onClick={() => handleDeleteComponent(comp.id)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition" title="Delete Component">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
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

            {/* Access Control section (Superuser only) */}
            {user?.is_superuser && (
                <div className="mt-12 bg-black/20 border border-brand-500/20 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-semibold text-white flex items-center">
                                <Shield className="mr-2 h-6 w-6 text-brand-500" />
                                Access Control
                            </h2>
                            <p className="text-sm text-gray-400 mt-1">Manage which groups have access to this project.</p>
                        </div>
                        <button
                            onClick={() => setAssigningGroup(!assigningGroup)}
                            className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            {assigningGroup ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" /> Assign Group</>}
                        </button>
                    </div>

                    {assigningGroup && (
                        <div className="mb-6 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                            <select
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                className="flex-1 px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                            >
                                <option value="">Select a Group...</option>
                                {allGroups.filter(g => !project.group_accesses?.some((pga: any) => pga.group_id === g.id)).map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                            <select
                                value={selectedAccessLevel}
                                onChange={(e) => setSelectedAccessLevel(e.target.value)}
                                className="w-full sm:w-48 px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white"
                            >
                                <option value="Viewer">Viewer</option>
                                <option value="Editor">Editor</option>
                                <option value="Admin">Admin</option>
                            </select>
                            <button
                                onClick={handleAssignGroup}
                                disabled={!selectedGroupId}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                Assign
                            </button>
                        </div>
                    )}

                    {project.group_accesses?.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {project.group_accesses.map((pga: any) => {
                                const groupName = allGroups.find(g => g.id === pga.group_id)?.name || `Group ID: ${pga.group_id}`;
                                return (
                                    <div key={pga.id} className="glass-panel p-4 rounded-lg flex items-center justify-between group">
                                        <div>
                                            <div className="text-white font-medium mb-1">{groupName}</div>
                                            <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex border bg-white/5 border-white/10 text-gray-300">
                                                {pga.access_level}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveGroup(pga.group_id)}
                                            className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Revoke Access"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <span className="text-gray-500 text-sm">No groups have been assigned access to this project.</span>
                        </div>
                    )}
                </div>
            )}

            {/* Custom Delete Confirmation Modal */}
            {deleteConfig && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-bold text-white mb-2">{deleteConfig.title}</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Are you absolutely sure you want to proceed? This action cannot be undone.
                            {deleteConfig.type === 'project' && " This will permanently delete the project and all associated servers and databases."}
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setDeleteConfig(null)}
                                disabled={deleting}
                                className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDelete}
                                disabled={deleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
