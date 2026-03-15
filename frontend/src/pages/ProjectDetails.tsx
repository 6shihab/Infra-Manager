import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Server, Database, KeySquare, Globe, ExternalLink, Activity, Info, Lock, Layers, Trash2, Shield, Plus, X, Copy, Check, FileText, Pencil, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { Select } from '../components/Select';

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
    const queryClient = useQueryClient();
    const toast = useToast();
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Custom Modal State
    const [deleteConfig, setDeleteConfig] = useState<{ type: 'project' | 'server' | 'database' | 'component', id: string | null, title: string, name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmRemoveGroup, setConfirmRemoveGroup] = useState<{ id: string; name: string } | null>(null);
    const [confirmRemoveUser, setConfirmRemoveUser] = useState<{ id: string; name: string } | null>(null);

    // Access Control State
    const { user } = useAuth();
    const [allGroups, setAllGroups] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [assigningUser, setAssigningUser] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedUserAccessLevel, setSelectedUserAccessLevel] = useState('Viewer');
    const [assigningGroup, setAssigningGroup] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [selectedAccessLevel, setSelectedAccessLevel] = useState('Viewer');

    // Deployment Note State
    const [editingNote, setEditingNote] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [noteCollapsed, setNoteCollapsed] = useState(false);

    useEffect(() => {
        if (user?.is_superuser) {
            api.get('/groups/')
                .then(res => setAllGroups(res.data))
                .catch(err => console.error("Failed to fetch groups", err));
            api.get('/users/')
                .then(res => setAllUsers(res.data))
                .catch(err => console.error("Failed to fetch users", err));
        }
    }, [user?.is_superuser]);

    const handleAssignGroup = async () => {
        if (!selectedGroupId) return;
        try {
            await api.post(`/projects/${id}/groups/${selectedGroupId}?access_level=${selectedAccessLevel}`);
            // refresh project
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setAssigningGroup(false);
            setSelectedGroupId('');
            setSelectedAccessLevel('Viewer');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to assign group");
        }
    };

    const handleRemoveGroup = async (groupId: string) => {
        try {
            await api.delete(`/projects/${id}/groups/${groupId}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setConfirmRemoveGroup(null);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to remove group");
            setConfirmRemoveGroup(null);
        }
    }

    const handleAssignUser = async () => {
        if (!selectedUserId) return;
        try {
            await api.post(`/projects/${id}/users/${selectedUserId}?access_level=${selectedUserAccessLevel}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setAssigningUser(false);
            setSelectedUserId('');
            setSelectedUserAccessLevel('Viewer');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to assign user");
        }
    };

    const handleRemoveUser = async (userId: string) => {
        try {
            await api.delete(`/projects/${id}/users/${userId}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setConfirmRemoveUser(null);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to remove user");
            setConfirmRemoveUser(null);
        }
    };

    const executeDelete = async () => {
        if (!deleteConfig) return;
        setDeleting(true);
        try {
            if (deleteConfig.type === 'project') {
                await api.delete(`/projects/${id}`);
                queryClient.invalidateQueries({ queryKey: ['projects'] });
                navigate('/projects');
            } else if (deleteConfig.type === 'server') {
                await api.delete(`/projects/${id}/servers/${deleteConfig.id}`);
                setProject({ ...project, server_links: project.server_links.filter((s: any) => s.server_id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'database') {
                await api.delete(`/projects/${id}/databases/${deleteConfig.id}`);
                setProject({ ...project, database_links: project.database_links.filter((db: any) => db.database_engine_id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'component') {
                await api.delete(`/components/${deleteConfig.id}`);
                setProject({ ...project, components: project.components.filter((c: any) => c.id !== deleteConfig.id) });
                setDeleteConfig(null);
            }
        } catch (err: any) {
            console.error(`Failed to delete ${deleteConfig.type}`, err);
            const detail = err?.response?.data?.detail || err?.message || `Error deleting ${deleteConfig.type}.`;
            toast.error(detail);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteProject = () => setDeleteConfig({ type: 'project', id: id!, title: 'Delete Project', name: project?.name || '' });
    const handleDeleteServer = (serverId: string, serverName: string) => setDeleteConfig({ type: 'server', id: serverId, title: 'Remove Server', name: serverName });
    const handleDeleteDatabase = (dbId: string, dbName: string) => setDeleteConfig({ type: 'database', id: dbId, title: 'Remove Database', name: dbName });
    const handleDeleteComponent = (compId: string, compName: string) => setDeleteConfig({ type: 'component', id: compId, title: 'Delete Component', name: compName });

    const handleSaveNote = async () => {
        setSavingNote(true);
        try {
            await api.put(`/projects/${id}`, { deployment_note: noteText });
            setProject({ ...project, deployment_note: noteText });
            setEditingNote(false);
            toast.success("Deployment note saved.");
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to save deployment note.");
        } finally {
            setSavingNote(false);
        }
    };

    useEffect(() => {
        api.get(`/projects/${id}`)
            .then(res => setProject(res.data))
            .catch(err => {
                console.error("Failed to load project from backend, falling back to mock", err);
                // Fallback Mock data for project #id
                setProject({
                    id: id,
                    name: "Sample Project (Fallback)",
                    description: "Database might be empty or unavailable.",
                    environment: "Dev",
                    primary_domain: "dev.example.com",
                    server_links: [
                        { server_id: 101, username: "app_user", password: "mockpassword1", server: { id: 101, name: "Web Node 1", ip_address: "192.168.1.10", os: "Ubuntu 22.04 LTS", region: "AWS us-east-1" } }
                    ],
                    database_links: [
                        { database_engine_id: 201, db_name: "dev_db", username: "admin", password: "mockpassword2", database_engine: { id: 201, name: "Primary Cluster", engine: "PostgreSQL 15", host: "db.example.internal", port: 5432 } }
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

    const userRole: string | null = project.current_user_role ?? null;
    const canEdit = user?.is_superuser || userRole === 'Admin' || userRole === 'Editor';
    const canDelete = user?.is_superuser || userRole === 'Admin';

    const roleBadgeClass: Record<string, string> = {
        Admin: 'bg-red-500/10 text-red-400 border border-red-500/20',
        Editor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        Viewer: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
    };

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
                        {!user?.is_superuser && userRole && (
                            <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${roleBadgeClass[userRole] ?? roleBadgeClass.Viewer}`}>
                                {userRole}
                            </span>
                        )}
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
                        <div className="flex items-center text-sm text-gray-300 font-medium" title={project.last_checked_at ? `Last checked: ${formatDateTime(project.last_checked_at)}` : ''}>
                            {project.is_online === true ? (
                                <><span className="h-2.5 w-2.5 rounded-full mr-2 bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Online</>
                            ) : project.is_online === false ? (
                                <><span className="h-2.5 w-2.5 rounded-full mr-2 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span> Offline</>
                            ) : (
                                <><Activity className="mr-2 h-4 w-4 text-gray-500" /> Pending Check...</>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    {canDelete && (
                        <button onClick={handleDeleteProject} className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 transition">
                            Delete Project
                        </button>
                    )}
                    {canEdit && (
                        <Link to={`/projects/${project.id}/edit`} className="px-4 py-2 bg-white/5 border border-dark-border text-white text-sm font-medium rounded-lg hover:bg-white/10 transition">
                            Edit Project
                        </Link>
                    )}
                </div>
            </div>

            <hr className="border-dark-border my-6" />

            {/* Deployment Note section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => setNoteCollapsed(!noteCollapsed)}
                        className="text-lg font-semibold text-white flex items-center hover:text-gray-300 transition-colors"
                    >
                        <FileText className="mr-2 h-5 w-5 text-brand-500" />
                        Deployment Note
                        <svg
                            className={`ml-2 h-4 w-4 transition-transform ${noteCollapsed ? '-rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {canEdit && !editingNote && !noteCollapsed && (
                        <button
                            onClick={() => { setNoteText(project.deployment_note || ''); setEditingNote(true); }}
                            className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                    )}
                </div>

                {!noteCollapsed && (
                    <div className="glass-panel p-5 rounded-xl">
                        {editingNote ? (
                            <div className="space-y-3">
                                <textarea
                                    rows={6}
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    className="w-full px-4 py-3 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500 text-sm font-mono"
                                    placeholder="Deployment instructions, rollback steps, environment setup notes..."
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setEditingNote(false)}
                                        className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 border border-dark-border rounded-lg hover:bg-white/10 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveNote}
                                        disabled={savingNote}
                                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {savingNote ? 'Saving...' : <><Save className="mr-2 h-4 w-4" /> Save Note</>}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            project.deployment_note ? (
                                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{project.deployment_note}</p>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No deployment note has been added yet.</p>
                            )
                        )}
                    </div>
                )}
            </div>

            <hr className="border-dark-border my-6" />

            {/* Servers section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Server className="mr-2 h-5 w-5 text-brand-500" />
                        Compute Instances ({project.server_links?.length || 0})
                    </h2>
                    {canEdit && <Link to={`/projects/${project.id}/servers/new`} className="text-sm text-brand-500 hover:text-brand-400">Attach Server</Link>}
                </div>

                {project.server_links?.length === 0 && <p className="text-gray-500 text-sm">No servers attached to this project.</p>}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {project.server_links?.map((link: any) => {
                        const server = link.server;
                        return (
                            <div key={link.server_id} className="glass-panel p-5 rounded-xl">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-start gap-3 group/btn">
                                        <Server className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <h3 className="font-medium text-white group-hover/btn:text-brand-400 transition-colors flex items-center gap-2">
                                                {server.name} ({server.ip_address})
                                                <CopyButton text={server.ip_address} className="opacity-0 group-hover/btn:opacity-100" />
                                            </h3>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                                {server.os && <span className="flex items-center"><Info className="w-3 h-3 mr-1" /> {server.os}</span>}
                                                {server.region && <span className="flex items-center"><Globe className="w-3 h-3 mr-1" /> {server.region}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-md cursor-help ${server.is_online === true ? 'bg-emerald-500/10 text-emerald-500' : server.is_online === false ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`} title={server.is_online === true ? 'Status: Online' : server.is_online === false ? 'Status: Offline' : server.last_checked_at ? 'Status: Unknown' : 'Status: Pending Check'}>
                                            <Activity className={`w-4 h-4 ${(server.is_online !== null && server.is_online !== false) ? 'animate-pulse' : ''}`} />
                                        </div>
                                        {server.can_edit && (
                                            <Link to={`/servers/${server.id}/edit`} className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded-md transition border border-dark-border" title="Edit Global Server">
                                                Edit Global
                                            </Link>
                                        )}
                                        {canEdit && (
                                            <button onClick={() => handleDeleteServer(server.id, server.name)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors" title="Detach Server from Project">
                                                <X className="w-4 h-4" />
                                                <span className="sr-only">Detach</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-dark-border pt-4 mt-2">
                                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                        <Lock className="w-3 h-3 mr-1.5" /> Authentication {(link.username || link.password || link.ssh_key) ? <span className="ml-2 px-1.5 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[10px]">Project Specific</span> : <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>}
                                    </div>
                                    {(link.username || link.password || link.ssh_key || server.username || server.password || server.ssh_key) ? (
                                        <SecretField
                                            username={link.username || server.username}
                                            password={link.password || server.password}
                                            ssh_key={link.ssh_key || server.ssh_key}
                                            label="SSH / Root" />
                                    ) : (
                                        <p className="text-sm text-gray-500 mt-2">No credentials attached.</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Database section */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Database className="mr-2 h-5 w-5 text-brand-500" />
                        Databases ({project.database_links?.length || 0})
                    </h2>
                    {canEdit && <Link to={`/projects/${project.id}/databases/new`} className="text-sm text-brand-500 hover:text-brand-400">Attach Database</Link>}
                </div>

                {project.database_links?.length === 0 && <p className="text-gray-500 text-sm">No databases attached to this project.</p>}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {project.database_links?.map((link: any) => {
                        const db = link.database_engine;
                        return (
                            <div key={link.database_engine_id} className="glass-panel p-5 rounded-xl">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                    <div>
                                        <div className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                                            <Database className="w-4 h-4 text-gray-400" />
                                            {db.name}
                                        </div>
                                        <div className="text-sm text-gray-400 font-mono flex items-center gap-2 group/dbname mb-1">
                                            {link.db_name}
                                            <CopyButton text={link.db_name} className="opacity-0 group-hover/dbname:opacity-100" />
                                        </div>
                                        <div className="text-sm text-gray-400 font-mono flex items-center gap-2 group/host">
                                            {db.host}{db.port ? `:${db.port}` : ''}
                                            <CopyButton text={db.port ? `${db.host}:${db.port}` : db.host} className="opacity-0 group-hover/host:opacity-100" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="px-3 py-1 bg-brand-500/10 text-brand-400 rounded-lg text-sm font-medium border border-brand-500/20">
                                            {db.engine}
                                        </div>
                                        {db.can_edit && (
                                            <Link to={`/databases/${db.id}/edit`} className="text-xs text-white hover:text-gray-300 px-2 py-1 bg-white/5 hover:bg-white/10 border border-dark-border rounded" title="Edit Global Database Engine">
                                                Edit Global
                                            </Link>
                                        )}
                                        {canEdit && (
                                            <button onClick={() => handleDeleteDatabase(db.id, db.name)} className="text-xs text-red-500 hover:text-red-400 p-1 bg-red-500/10 hover:bg-red-500/20 rounded" title="Detach DB from Project">
                                                Detach
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-dark-border pt-4 mt-2">
                                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                        <KeySquare className="w-3 h-3 mr-1.5" /> Authentication {(link.username || link.password) ? <span className="ml-2 px-1.5 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[10px]">Project Specific</span> : <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>}
                                    </div>
                                    {(link.username || link.password || db.username || db.password) ? (
                                        <SecretField
                                            username={link.username || db.username}
                                            password={link.password || db.password}
                                            label="Database User" />
                                    ) : (
                                        <p className="text-sm text-gray-500 mt-2">No credentials attached.</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Custom Components section */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                        <Layers className="mr-2 h-5 w-5 text-brand-500" />
                        Other Infrastructure ({project.components?.length || 0})
                    </h2>
                    {canEdit && <Link to={`/projects/${project.id}/components/new`} className="text-sm text-brand-500 hover:text-brand-400">Add Component</Link>}
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
                                    {canEdit && (
                                        <Link to={`/projects/${project.id}/components/${comp.id}/edit`} className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-md transition" title="Edit Component">
                                            <Info className="w-4 h-4" />
                                        </Link>
                                    )}
                                    {canDelete && (
                                        <button onClick={() => handleDeleteComponent(comp.id, comp.name)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition" title="Delete Component">
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

            {/* Access Control section (Superuser only) */}
            {user?.is_superuser && (
                <div className="mt-12 bg-black/20 border border-brand-500/20 rounded-xl p-6 space-y-8">
                    <h2 className="text-xl font-semibold text-white flex items-center">
                        <Shield className="mr-2 h-6 w-6 text-brand-500" />
                        Access Control
                    </h2>

                    {/* Groups sub-section */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-base font-semibold text-white">Groups</h3>
                                <p className="text-sm text-gray-400 mt-0.5">Manage which groups have access to this project.</p>
                            </div>
                            <button
                                onClick={() => setAssigningGroup(!assigningGroup)}
                                className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {assigningGroup ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" /> Assign Group</>}
                            </button>
                        </div>

                        {assigningGroup && (
                            <div className="mb-4 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                                <Select
                                    value={selectedGroupId}
                                    onChange={setSelectedGroupId}
                                    options={allGroups
                                        .filter((g: any) => !project.group_accesses?.some((pga: any) => pga.group_id === g.id))
                                        .map((g: any) => ({ value: g.id, label: g.name }))}
                                    placeholder="Select a Group..."
                                    className="flex-1"
                                />
                                <Select
                                    value={selectedAccessLevel}
                                    onChange={setSelectedAccessLevel}
                                    options={[
                                        { value: 'Viewer', label: 'Viewer' },
                                        { value: 'Editor', label: 'Editor' },
                                        { value: 'Admin', label: 'Admin' },
                                    ]}
                                    className="w-full sm:w-48"
                                />
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
                                                onClick={() => setConfirmRemoveGroup({ id: pga.group_id, name: groupName })}
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
                            <div className="text-center py-6">
                                <span className="text-gray-500 text-sm">No groups have been assigned access to this project.</span>
                            </div>
                        )}
                    </div>

                    {/* Users sub-section */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-base font-semibold text-white">Users</h3>
                                <p className="text-sm text-gray-400 mt-0.5">Grant access directly to individual users.</p>
                            </div>
                            <button
                                onClick={() => setAssigningUser(!assigningUser)}
                                className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {assigningUser ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" /> Assign User</>}
                            </button>
                        </div>

                        {assigningUser && (
                            <div className="mb-4 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                                <Select
                                    value={selectedUserId}
                                    onChange={setSelectedUserId}
                                    options={allUsers
                                        .filter((u: any) => !project.user_accesses?.some((pua: any) => pua.user_id === u.id) && u.id !== project.created_by)
                                        .map((u: any) => ({ value: u.id, label: u.full_name || u.email }))}
                                    placeholder="Select a User..."
                                    className="flex-1"
                                />
                                <Select
                                    value={selectedUserAccessLevel}
                                    onChange={setSelectedUserAccessLevel}
                                    options={[
                                        { value: 'Viewer', label: 'Viewer' },
                                        { value: 'Editor', label: 'Editor' },
                                        { value: 'Admin', label: 'Admin' },
                                    ]}
                                    className="w-full sm:w-48"
                                />
                                <button
                                    onClick={handleAssignUser}
                                    disabled={!selectedUserId}
                                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Assign
                                </button>
                            </div>
                        )}

                        {project.user_accesses?.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {project.user_accesses.map((pua: any) => {
                                    const u = allUsers.find(u => u.id === pua.user_id);
                                    const userName = u ? (u.full_name || u.email) : `User ID: ${pua.user_id}`;
                                    return (
                                        <div key={pua.id} className="glass-panel p-4 rounded-lg flex items-center justify-between group">
                                            <div>
                                                <div className="text-white font-medium mb-1">{userName}</div>
                                                <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex border bg-white/5 border-white/10 text-gray-300">
                                                    {pua.access_level}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setConfirmRemoveUser({ id: pua.user_id, name: userName })}
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
                            <div className="text-center py-6">
                                <span className="text-gray-500 text-sm">No users have been directly assigned access to this project.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={deleteConfig !== null}
                title={deleteConfig?.title ?? ''}
                message={
                    deleteConfig?.type === 'project'
                        ? `Are you sure you want to delete the project "${deleteConfig.name}"? This action cannot be undone and will permanently delete all associated data.`
                        : `Are you sure you want to remove "${deleteConfig?.name}" from this project? This action cannot be undone.`
                }
                confirmText={deleteConfig?.name}
                loading={deleting}
                onConfirm={executeDelete}
                onCancel={() => setDeleteConfig(null)}
            />

            <ConfirmDialog
                open={confirmRemoveGroup !== null}
                title="Remove Group"
                message={`Remove group "${confirmRemoveGroup?.name}" from this project?`}
                confirmLabel="Remove"
                confirmText={confirmRemoveGroup?.name}
                onConfirm={() => confirmRemoveGroup && handleRemoveGroup(confirmRemoveGroup.id)}
                onCancel={() => setConfirmRemoveGroup(null)}
            />

            <ConfirmDialog
                open={confirmRemoveUser !== null}
                title="Remove User"
                message={`Remove user "${confirmRemoveUser?.name}" from this project?`}
                confirmLabel="Remove"
                confirmText={confirmRemoveUser?.name}
                onConfirm={() => confirmRemoveUser && handleRemoveUser(confirmRemoveUser.id)}
                onCancel={() => setConfirmRemoveUser(null)}
            />
        </div>
    );
}
