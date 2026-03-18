import { useQuery } from '@tanstack/react-query';
import { Server, Database, FolderKanban, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import type { ProjectListItem } from '../types/api';

export function Dashboard() {
    const { data: projects = [], isLoading: loading } = useQuery({
        queryKey: ['projects'],
        queryFn: async () => {
            const { data } = await api.get('/projects/');
            return data;
        }
    });

    const totalProjects = projects.length;
    const totalServers = projects.reduce((acc: number, proj: ProjectListItem) => acc + (proj.server_count || 0), 0);
    const totalDatabases = projects.reduce((acc: number, proj: ProjectListItem) => acc + (proj.database_count || 0), 0);

    const stats = [
        { name: 'Total Projects', value: totalProjects.toString(), icon: FolderKanban, change: 'Active', trend: 'neutral' },
        { name: 'Active Servers', value: totalServers.toString(), icon: Server, change: 'Active', trend: 'neutral' },
        { name: 'Databases', value: totalDatabases.toString(), icon: Database, change: 'Stable', trend: 'neutral' },
        { name: 'System Health', value: '100%', icon: Activity, change: 'Optimal', trend: 'up' },
    ];

    const recentProjects = [...projects].reverse().slice(0, 5);

    if (loading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="space-y-1">
                    <div className="h-7 w-32 bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="glass-panel rounded-xl p-5 animate-pulse">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <div className="h-3 w-24 bg-white/5 rounded" />
                                    <div className="h-7 w-12 bg-white/5 rounded" />
                                </div>
                                <div className="h-12 w-12 bg-white/5 rounded-lg" />
                            </div>
                            <div className="mt-4 h-3 w-16 bg-white/5 rounded" />
                        </div>
                    ))}
                </div>
                <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="h-5 w-36 bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
                    </div>
                    <div className="glass-panel rounded-xl overflow-hidden animate-pulse">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="px-6 py-4 border-b border-dark-border flex items-center space-x-4">
                                <div className="h-8 w-8 rounded-md bg-white/5 shrink-0" />
                                <div className="h-4 w-40 bg-white/5 rounded" />
                                <div className="h-5 w-16 bg-white/5 rounded-full ml-auto" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
                <p className="text-sm text-gray-400 mt-1">Overview of your infrastructure and projects.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.name} className="glass-panel rounded-xl p-5 hover:bg-dark-card/90 transition-colors">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-400">{item.name}</p>
                                    <p className="text-2xl font-semibold text-white mt-1">{item.value}</p>
                                </div>
                                <div className="h-12 w-12 bg-white/5 rounded-lg flex items-center justify-center">
                                    <Icon className="h-6 w-6 text-brand-500" />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-xs">
                                <span className={item.trend === 'up' ? 'text-emerald-400' : 'text-gray-400'}>
                                    {item.change}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium text-white">Recent Projects</h2>
                    <Link to="/projects" className="text-sm text-brand-500 hover:text-brand-400 transition-colors font-medium">
                        View all
                    </Link>
                </div>

                <div className="glass-panel rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-dark-border">
                        <thead className="bg-black/20">
                            <tr>
                                <th scope="col" className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                                <th scope="col" className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Environment</th>
                                <th scope="col" className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Servers</th>
                                <th scope="col" className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border bg-transparent">
                            {recentProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 sm:px-6 text-center text-sm text-gray-500">
                                        No projects found. <Link to="/projects/new" className="text-brand-500 hover:underline">Create your first project</Link>
                                    </td>
                                </tr>
                            ) : recentProjects.map((project) => (
                                <tr key={project.id} className="hover:bg-white/5 transition-colors group cursor-pointer">
                                    <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-md bg-brand-500/20 text-brand-500 flex items-center justify-center mr-3 font-semibold group-hover:bg-brand-500 group-hover:text-white transition-colors">
                                                {project.name.charAt(0).toUpperCase()}
                                            </div>
                                            <Link to={`/projects/${project.id}`} className="text-sm font-medium text-white hover:underline">
                                                {project.name}
                                            </Link>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap hidden sm:table-cell">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                            project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                            }`}>
                                            {project.environment}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-300 hidden sm:table-cell">
                                        <div className="flex items-center">
                                            <Server className="h-4 w-4 mr-1.5 text-gray-500" />
                                            {project.server_count ?? 0}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 sm:px-6 sm:py-4 whitespace-nowrap">
                                        <span className="flex items-center text-sm text-gray-300">
                                            {project.is_online === true ? (
                                                <><span className="h-2 w-2 rounded-full mr-2 bg-emerald-500 animate-pulse"></span> Online</>
                                            ) : project.is_online === false ? (
                                                <><span className="h-2 w-2 rounded-full mr-2 bg-red-500 animate-pulse"></span> Offline</>
                                            ) : (
                                                <><span className="h-2 w-2 rounded-full mr-2 bg-gray-500"></span> Unknown</>
                                            )}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
