import { Link } from 'react-router-dom';
import { Globe, ExternalLink, Activity } from 'lucide-react';
import { CopyButton } from '../CopyButton';
import { formatDateTime } from '../../utils/dateUtils';

interface ProjectHeaderProps {
    project: {
        id: string;
        name: string;
        description?: string;
        environment: string;
        primary_domain?: string;
        is_online: boolean | null;
        last_checked_at?: string;
    };
    userRole: string | null;
    isSuperuser: boolean;
    canEdit: boolean;
    canDelete: boolean;
    onDeleteProject: () => void;
}

const roleBadgeClass: Record<string, string> = {
    Admin: 'bg-red-500/10 text-red-400 border border-red-500/20',
    Editor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    Viewer: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
};

export function ProjectHeader({ project, userRole, isSuperuser, canEdit, canDelete, onDeleteProject }: ProjectHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{project.name}</h1>
                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                        project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                        {project.environment}
                    </span>
                    {!isSuperuser && userRole && (
                        <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${roleBadgeClass[userRole] ?? roleBadgeClass.Viewer}`}>
                            {userRole}
                        </span>
                    )}
                </div>
                <p className="text-base text-gray-400 max-w-2xl">{project.description}</p>

                <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-6">
                    {project.primary_domain && (
                        <div className="flex items-center text-sm text-gray-300 gap-2 group/domain">
                            <Globe className="mr-2 h-4 w-4 text-brand-500" />
                            <a href={`https://${project.primary_domain}`} target="_blank" rel="noreferrer" className="hover:text-brand-400 hover:underline inline-flex items-center">
                                {project.primary_domain}
                                <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                            <CopyButton text={project.primary_domain} className="md:opacity-0 md:group-hover/domain:opacity-100" />
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

            <div className="flex flex-wrap gap-2 sm:gap-3">
                {canDelete && (
                    <button onClick={onDeleteProject} className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 hover:text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 transition">
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
    );
}
