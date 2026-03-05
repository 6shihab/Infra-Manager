import { useState, useEffect } from 'react';
import { Server, Database, FolderKanban, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

export function Dashboard() {
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/projects/')
            .then(res => setProjects(res.data))
            .catch(err => console.error("Failed to load generic data", err))
            .finally(() => setLoading(false));
    }, []);

    const totalProjects = projects.length;
    const totalServers = projects.reduce((acc, proj) => acc + (proj.servers?.length || 0), 0);
    const totalDatabases = projects.reduce((acc, proj) => acc + (proj.databases?.length || 0), 0);

    const stats = [
        { name: 'Total Projects', value: totalProjects.toString(), icon: FolderKanban, change: 'Active', trend: 'neutral' },
        { name: 'Active Servers', value: totalServers.toString(), icon: Server, change: 'Active', trend: 'neutral' },
        { name: 'Databases', value: totalDatabases.toString(), icon: Database, change: 'Stable', trend: 'neutral' },
        { name: 'System Health', value: '100%', icon: Activity, change: 'Optimal', trend: 'up' },
    ];

    const recentProjects = [...projects].reverse().slice(0, 5);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
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
                    <table className="min-w-full divide-y divide-dark-border">
                        <thead className="bg-black/20">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Environment</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Servers</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border bg-transparent">
                            {recentProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                                        No projects found. <Link to="/projects/new" className="text-brand-500 hover:underline">Create your first project</Link>
                                    </td>
                                </tr>
                            ) : recentProjects.map((project) => (
                                <tr key={project.id} className="hover:bg-white/5 transition-colors group cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-md bg-brand-500/20 text-brand-500 flex items-center justify-center mr-3 font-semibold group-hover:bg-brand-500 group-hover:text-white transition-colors">
                                                {project.name.charAt(0).toUpperCase()}
                                            </div>
                                            <Link to={`/projects/${project.id}`} className="text-sm font-medium text-white hover:underline">
                                                {project.name}
                                            </Link>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                            project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                            }`}>
                                            {project.environment}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        <div className="flex items-center">
                                            <Server className="h-4 w-4 mr-1.5 text-gray-500" />
                                            {project.servers?.length || 0}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
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
    );
}
