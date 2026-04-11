import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Server, Database, Globe, AlertCircle, FolderOpen, Settings2, Folder, ChevronRight, Home } from 'lucide-react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateUtils';
import { Select } from '../components/Select';
import { FolderManager } from '../components/FolderManager';
import { useProjectFolders, useProjectFoldersFlat } from '../hooks/useProjectFolders';
import type { ProjectListItem, ProjectFolder } from '../types/api';

function ProjectCard({ project }: { project: ProjectListItem }) {
    return (
        <Link to={`/projects/${project.id}`} className="group flex flex-col glass-panel rounded-xl overflow-hidden hover:border-brand-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-brand-500/10">
            <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-3">
                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400' :
                        project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-gray-500/10 text-gray-400'
                        }`}>
                        {project.environment}
                    </span>
                    <div className="flex items-center text-xs font-medium text-gray-400" title={project.last_checked_at ? `Last checked: ${formatDateTime(project.last_checked_at)}` : 'Not checked yet'}>
                        {project.is_online === true ? (
                            <><span className="h-2 w-2 rounded-full mr-1.5 bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Online</>
                        ) : project.is_online === false ? (
                            <><span className="h-2 w-2 rounded-full mr-1.5 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span> Offline</>
                        ) : null}
                    </div>
                </div>

                <h3 className="text-lg font-semibold text-white group-hover:text-brand-400 transition-colors mb-2">
                    {project.name}
                </h3>

                <p className="text-sm text-gray-400 line-clamp-2 min-h-[40px]">
                    {project.description}
                </p>

                {project.primary_domain && (
                    <div className="mt-4 flex items-center text-sm text-gray-300 bg-white/5 w-fit px-2.5 py-1 rounded-md border border-white/5">
                        <Globe className="flex-shrink-0 mr-1.5 h-4 w-4 text-brand-500" />
                        <span className="truncate">{project.primary_domain}</span>
                    </div>
                )}
            </div>

            <div className="px-5 py-3 bg-black/40 border-t border-dark-border flex items-center justify-between text-sm text-gray-400">
                <div className="flex space-x-4">
                    <div className="flex items-center" title="Servers">
                        <Server className="h-4 w-4 mr-1.5 text-gray-500" />
                        {project.server_count ?? 0}
                    </div>
                    <div className="flex items-center" title="Databases">
                        <Database className="h-4 w-4 mr-1.5 text-gray-500" />
                        {project.database_count ?? 0}
                    </div>
                </div>
                <span className="text-brand-500 font-medium group-hover:underline text-xs">View Details &rarr;</span>
            </div>
        </Link>
    );
}

/** Collect all folder IDs from a tree node and its descendants */
function collectFolderIds(folder: ProjectFolder): string[] {
    const ids = [folder.id];
    if (folder.children) {
        for (const child of folder.children) {
            ids.push(...collectFolderIds(child));
        }
    }
    return ids;
}

function FolderCard({ folder, projectCount, onClick }: { folder: ProjectFolder; projectCount: number; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="group flex flex-col glass-panel rounded-xl overflow-hidden hover:border-brand-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-brand-500/10 text-left w-full"
        >
            <div className="p-5 flex-1">
                <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: (folder.color || '#6B7280') + '20' }}>
                        <Folder className="h-5 w-5" style={{ color: folder.color || '#6B7280' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white group-hover:text-brand-400 transition-colors truncate">
                            {folder.name}
                        </h3>
                        <p className="text-xs text-gray-500">
                            {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                            {folder.children?.length ? ` \u00B7 ${folder.children.length} ${folder.children.length === 1 ? 'subfolder' : 'subfolders'}` : ''}
                        </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                </div>
            </div>
        </button>
    );
}

function Breadcrumbs({ path, onNavigate }: { path: ProjectFolder[]; onNavigate: (folderId: string | null) => void }) {
    return (
        <nav className="flex items-center gap-1 text-sm mb-2 flex-wrap">
            <button
                onClick={() => onNavigate(null)}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
            >
                <Home className="h-3.5 w-3.5" />
                <span>All Projects</span>
            </button>
            {path.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                    <button
                        onClick={() => onNavigate(folder.id)}
                        className="text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/5 flex items-center gap-1.5"
                    >
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: folder.color || '#6B7280' }} />
                        {folder.name}
                    </button>
                </span>
            ))}
        </nav>
    );
}

export function Projects() {
    const [searchParams] = useSearchParams();
    const initialQuery = searchParams.get('q') || '';

    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [environmentFilter, setEnvironmentFilter] = useState('All Environments');
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderManagerOpen, setFolderManagerOpen] = useState(false);

    const { data: projects, isLoading: loading, isError } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const { data } = await api.get('/projects/');
            return data;
        }
    });

    const { data: folderTree = [] } = useProjectFolders();
    const { data: foldersFlat = [] } = useProjectFoldersFlat();

    // Sync input with URL search params if they are passed from Navbar
    useEffect(() => {
        const query = searchParams.get('q');
        if (query !== null) {
            setSearchQuery(query);
        }
    }, [searchParams]);

    // Find a folder in the tree by ID
    const findFolder = useCallback((id: string): ProjectFolder | null => {
        function search(nodes: ProjectFolder[]): ProjectFolder | null {
            for (const node of nodes) {
                if (node.id === id) return node;
                if (node.children?.length) {
                    const found = search(node.children);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(folderTree);
    }, [folderTree]);

    // Build breadcrumb path from root to current folder
    const breadcrumbPath = useMemo(() => {
        if (!currentFolderId) return [];
        const path: ProjectFolder[] = [];
        // Walk up via flat list parent_id
        let current = foldersFlat.find(f => f.id === currentFolderId);
        while (current) {
            path.unshift(current);
            current = current.parent_id ? foldersFlat.find(f => f.id === current!.parent_id) : undefined;
        }
        return path;
    }, [currentFolderId, foldersFlat]);

    // Current folder object (null = root)
    const currentFolder = currentFolderId ? findFolder(currentFolderId) : null;

    // Subfolders of the current location
    const subfolders = currentFolder ? (currentFolder.children || []) : folderTree;

    // Filter projects by search + environment
    const baseFiltered = useMemo(() => {
        if (!projects) return [];
        return projects.filter((project: ProjectListItem) => {
            const matchesEnv = environmentFilter === 'All Environments' || project.environment === environmentFilter;
            const query = searchQuery.toLowerCase();
            const matchesSearch = !query ||
                project.name.toLowerCase().includes(query) ||
                (project.description && project.description.toLowerCase().includes(query)) ||
                (project.primary_domain && project.primary_domain.toLowerCase().includes(query));
            return matchesEnv && matchesSearch;
        });
    }, [projects, searchQuery, environmentFilter]);

    // Projects directly in the current folder (not in subfolders)
    const currentProjects = useMemo(() => {
        return baseFiltered.filter(p =>
            currentFolderId ? p.folder_id === currentFolderId : !p.folder_id
        );
    }, [baseFiltered, currentFolderId]);

    // Count projects in a folder (including all descendants) for the folder card
    const countProjectsInFolder = useCallback((folder: ProjectFolder): number => {
        const allIds = collectFolderIds(folder);
        return baseFiltered.filter(p => p.folder_id && allIds.includes(p.folder_id)).length;
    }, [baseFiltered]);

    const hasFolders = foldersFlat.length > 0;
    const isAtRoot = !currentFolderId;

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-medium text-white mb-1">Failed to load projects</h3>
                <p className="text-gray-400 text-sm">Could not connect to the server. Please check your connection and try again.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="h-7 w-28 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
                    </div>
                    <div className="h-9 w-28 bg-white/5 rounded-lg animate-pulse" />
                </div>
                <div className="flex items-center space-x-4">
                    <div className="h-9 flex-1 max-w-md bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-9 w-40 bg-white/5 rounded-lg animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="glass-panel rounded-xl overflow-hidden animate-pulse">
                            <div className="p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="h-5 w-16 bg-white/5 rounded-full" />
                                    <div className="h-4 w-12 bg-white/5 rounded" />
                                </div>
                                <div className="h-5 w-3/4 bg-white/5 rounded" />
                                <div className="space-y-1.5">
                                    <div className="h-3 bg-white/5 rounded w-full" />
                                    <div className="h-3 bg-white/5 rounded w-4/5" />
                                </div>
                                <div className="h-7 w-36 bg-white/5 rounded-md" />
                            </div>
                            <div className="px-5 py-3 bg-black/40 border-t border-dark-border h-10" />
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
                    <h1 className="text-2xl font-bold text-white tracking-tight">Projects</h1>
                    <p className="text-sm text-gray-400 mt-1">Manage your deployed applications and infrastructure.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFolderManagerOpen(true)}
                        className="inline-flex items-center justify-center px-3 py-2 border border-dark-border rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                        title="Manage Folders"
                    >
                        <Settings2 className="h-4 w-4 mr-1.5" />
                        Folders
                    </button>
                    <Link to="/projects/new" className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-colors">
                        <Plus className="-ml-1 mr-2 h-5 w-5" />
                        Add Project
                    </Link>
                </div>
            </div>

            {/* Breadcrumbs */}
            {hasFolders && (
                <Breadcrumbs path={breadcrumbPath} onNavigate={setCurrentFolderId} />
            )}

            {/* Filters */}
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
                        placeholder="Search projects by name, description, or domain..."
                    />
                </div>
                <Select
                    value={environmentFilter}
                    onChange={setEnvironmentFilter}
                    options={[
                        { value: 'All Environments', label: 'All Environments' },
                        { value: 'Prod', label: 'Prod' },
                        { value: 'Staging', label: 'Staging' },
                        { value: 'Dev', label: 'Dev' },
                    ]}
                    className="w-full sm:w-40"
                />
            </div>

            {/* Subfolders */}
            {subfolders.length > 0 && (
                <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        {isAtRoot ? 'Folders' : 'Subfolders'}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {subfolders.map((folder) => (
                            <FolderCard
                                key={folder.id}
                                folder={folder}
                                projectCount={countProjectsInFolder(folder)}
                                onClick={() => setCurrentFolderId(folder.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Projects in current folder */}
            {currentProjects.length > 0 && (
                <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        {isAtRoot ? (hasFolders ? 'Unfiled Projects' : 'Projects') : 'Projects'}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {currentProjects.map((project: ProjectListItem) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {subfolders.length === 0 && currentProjects.length === 0 && (
                <div className="text-center py-12 bg-dark-card/30 rounded-xl border border-dark-border">
                    <FolderOpen className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-1">
                        {searchQuery || environmentFilter !== 'All Environments' ? 'No projects found' : 'This folder is empty'}
                    </h3>
                    <p className="text-gray-400">
                        {searchQuery || environmentFilter !== 'All Environments'
                            ? 'Try adjusting your search or filters.'
                            : 'Add projects to this folder or create subfolders.'}
                    </p>
                </div>
            )}

            <FolderManager open={folderManagerOpen} onClose={() => setFolderManagerOpen(false)} />
        </div>
    );
}
