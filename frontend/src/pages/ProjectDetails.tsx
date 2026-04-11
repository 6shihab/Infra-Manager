import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { ProjectHeader } from '../components/project/ProjectHeader';
import { DeploymentNote } from '../components/project/DeploymentNote';
import { useProjectFoldersFlat } from '../hooks/useProjectFolders';
import { ServerSection } from '../components/project/ServerSection';
import { DatabaseSection } from '../components/project/DatabaseSection';
import { ComponentSection } from '../components/project/ComponentSection';
import { AccessControlSection } from '../components/project/AccessControlSection';
import type { ApiError } from '../types/api';

export function ProjectDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const toast = useToast();
    const { isOnline } = useOffline();
    const offlineElectron = !isOnline && !!window.electronAPI;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const { user } = useAuth();
    const { data: foldersFlat = [] } = useProjectFoldersFlat();
    const projectFolder = project?.folder_id ? foldersFlat.find(f => f.id === project.folder_id) : null;
    const [deleteConfig, setDeleteConfig] = useState<{ type: 'project' | 'server' | 'database' | 'component', id: string | null, title: string, name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [confirmRemoveGroup, setConfirmRemoveGroup] = useState<{ id: string; name: string } | null>(null);
    const [confirmRemoveUser, setConfirmRemoveUser] = useState<{ id: string; name: string } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allGroups, setAllGroups] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [assigningUser, setAssigningUser] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedUserAccessLevel, setSelectedUserAccessLevel] = useState('Viewer');
    const [assigningGroup, setAssigningGroup] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [selectedAccessLevel, setSelectedAccessLevel] = useState('Viewer');
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
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setAssigningGroup(false);
            setSelectedGroupId('');
            setSelectedAccessLevel('Viewer');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : "Failed to assign group");
        }
    };

    const handleRemoveGroup = async (groupId: string) => {
        try {
            await api.delete(`/projects/${id}/groups/${groupId}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setConfirmRemoveGroup(null);
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : "Failed to remove group");
            setConfirmRemoveGroup(null);
        }
    };

    const handleAssignUser = async () => {
        if (!selectedUserId) return;
        try {
            await api.post(`/projects/${id}/users/${selectedUserId}?access_level=${selectedUserAccessLevel}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setAssigningUser(false);
            setSelectedUserId('');
            setSelectedUserAccessLevel('Viewer');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : "Failed to assign user");
        }
    };

    const handleRemoveUser = async (userId: string) => {
        try {
            await api.delete(`/projects/${id}/users/${userId}`);
            const res = await api.get(`/projects/${id}`);
            setProject(res.data);
            setConfirmRemoveUser(null);
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : "Failed to remove user");
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
                setProject({ ...project, server_links: project.server_links.filter((s: { server_id: string }) => s.server_id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'database') {
                await api.delete(`/projects/${id}/databases/${deleteConfig.id}`);
                setProject({ ...project, database_links: project.database_links.filter((db: { database_engine_id: string }) => db.database_engine_id !== deleteConfig.id) });
                setDeleteConfig(null);
            } else if (deleteConfig.type === 'component') {
                await api.delete(`/components/${deleteConfig.id}`);
                setProject({ ...project, components: project.components.filter((c: { id: string }) => c.id !== deleteConfig.id) });
                setDeleteConfig(null);
            }
        } catch (err: unknown) {
            console.error(`Failed to delete ${deleteConfig.type}`, err);
            const axiosErr = err as ApiError;
            const detail = axiosErr?.response?.data?.detail || axiosErr?.message || `Error deleting ${deleteConfig.type}.`;
            toast.error(typeof detail === 'string' ? detail : `Error deleting ${deleteConfig.type}.`);
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteProject = () => setDeleteConfig({ type: 'project', id: id!, title: 'Delete Project', name: project?.name || '' });
    const handleDeleteServer = (sid: string, name: string) => setDeleteConfig({ type: 'server', id: sid, title: 'Remove Server', name });
    const handleDeleteDatabase = (did: string, name: string) => setDeleteConfig({ type: 'database', id: did, title: 'Remove Database', name });
    const handleDeleteComponent = (cid: string, name: string) => setDeleteConfig({ type: 'component', id: cid, title: 'Delete Component', name });

    const handleSaveNote = async () => {
        setSavingNote(true);
        try {
            await api.put(`/projects/${id}`, { deployment_note: noteText });
            setProject({ ...project, deployment_note: noteText });
            setEditingNote(false);
            toast.success("Deployment note saved.");
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : "Failed to save deployment note.");
        } finally {
            setSavingNote(false);
        }
    };

    useEffect(() => {
        api.get(`/projects/${id}`)
            .then(res => setProject(res.data))
            .catch(err => {
                console.error("Failed to load project from backend, falling back to mock", err);
                setProject({ id, name: "Sample Project (Fallback)", description: "Database might be empty or unavailable.", environment: "Dev", primary_domain: "dev.example.com",
                    server_links: [{ server_id: 101, username: "app_user", password: "mockpassword1", server: { id: 101, name: "Web Node 1", ip_address: "192.168.1.10", os: "Ubuntu 22.04 LTS", region: "AWS us-east-1" } }],
                    database_links: [{ database_engine_id: 201, db_name: "dev_db", username: "admin", password: "mockpassword2", database_engine: { id: 201, name: "Primary Cluster", engine: "PostgreSQL 15", host: "db.example.internal", port: 5432 } }],
                    components: [] });
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
    return (
        <div className="space-y-6 pb-12 animate-in fade-in duration-300">
            <Link to="/projects" className="inline-flex items-center text-sm font-medium text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
            </Link>

            <ProjectHeader
                project={project}
                folderName={projectFolder?.name}
                folderColor={projectFolder?.color}
                userRole={userRole}
                isSuperuser={!!user?.is_superuser}
                canEdit={canEdit}
                canDelete={canDelete}
                onDeleteProject={handleDeleteProject}
            />

            <hr className="border-dark-border my-6" />

            <DeploymentNote
                deploymentNote={project.deployment_note}
                canEdit={canEdit}
                editingNote={editingNote}
                noteText={noteText}
                savingNote={savingNote}
                noteCollapsed={noteCollapsed}
                onToggleCollapse={() => setNoteCollapsed(!noteCollapsed)}
                onStartEdit={() => { setNoteText(project.deployment_note || ''); setEditingNote(true); }}
                onCancelEdit={() => setEditingNote(false)}
                onNoteTextChange={setNoteText}
                onSaveNote={handleSaveNote}
            />

            <hr className="border-dark-border my-6" />

            <ServerSection
                projectId={project.id}
                serverLinks={project.server_links || []}
                canEdit={canEdit}
                onDeleteServer={handleDeleteServer}
            />

            <DatabaseSection
                projectId={project.id}
                databaseLinks={project.database_links || []}
                canEdit={canEdit}
                onDeleteDatabase={handleDeleteDatabase}
            />

            <ComponentSection
                projectId={project.id}
                components={project.components || []}
                canEdit={canEdit}
                canDelete={canDelete}
                onDeleteComponent={handleDeleteComponent}
            />

            {/* Access Control section (Superuser only) */}
            {user?.is_superuser && (
                <AccessControlSection
                    allGroups={allGroups}
                    groupAccesses={project.group_accesses || []}
                    assigningGroup={assigningGroup}
                    selectedGroupId={selectedGroupId}
                    selectedAccessLevel={selectedAccessLevel}
                    onToggleAssigningGroup={() => setAssigningGroup(!assigningGroup)}
                    onSelectedGroupIdChange={setSelectedGroupId}
                    onSelectedAccessLevelChange={setSelectedAccessLevel}
                    onAssignGroup={handleAssignGroup}
                    onConfirmRemoveGroup={setConfirmRemoveGroup}
                    allUsers={allUsers}
                    userAccesses={project.user_accesses || []}
                    createdBy={project.created_by}
                    assigningUser={assigningUser}
                    selectedUserId={selectedUserId}
                    selectedUserAccessLevel={selectedUserAccessLevel}
                    onToggleAssigningUser={() => setAssigningUser(!assigningUser)}
                    onSelectedUserIdChange={setSelectedUserId}
                    onSelectedUserAccessLevelChange={setSelectedUserAccessLevel}
                    onAssignUser={handleAssignUser}
                    onConfirmRemoveUser={setConfirmRemoveUser}
                    offlineElectron={offlineElectron}
                />
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
