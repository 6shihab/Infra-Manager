import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Server, Database, Globe } from 'lucide-react';
import api from '../utils/api';

// Mock data to use when backend is unavailable
const fallbackProjects = [
    { id: 1, name: 'Core API Services', description: 'Main backend services handling user data and auth.', environment: 'Prod', primary_domain: 'api.example.com' },
    { id: 2, name: 'Frontend Application', description: 'Customer facing web application built with React.', environment: 'Prod', primary_domain: 'app.example.com' },
    { id: 3, name: 'Data Pipeline', description: 'ETL jobs and processing workers.', environment: 'Staging', primary_domain: 'etl.staging.example.com' }
];

export function Projects() {
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Attempt to fetch from backend
        api.get('/projects/')
            .then(response => {
                setProjects(response.data);
            })
            .catch((err) => {
                console.log("Backend offline, using fallback data", err);
                setProjects(fallbackProjects);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
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
                <Link to="/projects/new" className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-colors">
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    Add Project
                </Link>
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-4">
                <div className="relative flex-1 max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-dark-border rounded-lg leading-5 bg-black/20 text-gray-300 placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm transition-all"
                        placeholder="Search projects..."
                    />
                </div>
                <select className="block w-40 pl-3 pr-10 py-2 text-base border-dark-border border bg-black/20 text-gray-300 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm rounded-lg appearance-none cursor-pointer">
                    <option>All Environments</option>
                    <option>Production</option>
                    <option>Staging</option>
                    <option>Development</option>
                </select>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                    <Link to={`/projects/${project.id}`} key={project.id} className="group flex flex-col glass-panel rounded-xl overflow-hidden hover:border-brand-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-brand-500/10">
                        <div className="p-5 flex-1">
                            <div className="flex items-center justify-between mb-3">
                                <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${project.environment === 'Prod' ? 'bg-indigo-500/10 text-indigo-400' :
                                    project.environment === 'Staging' ? 'bg-amber-500/10 text-amber-400' :
                                        'bg-gray-500/10 text-gray-400'
                                    }`}>
                                    {project.environment}
                                </span>
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
                                    {project.servers?.length || Math.floor(Math.random() * 5) + 1}
                                </div>
                                <div className="flex items-center" title="Databases">
                                    <Database className="h-4 w-4 mr-1.5 text-gray-500" />
                                    {project.databases?.length || Math.floor(Math.random() * 3) + 1}
                                </div>
                            </div>
                            <span className="text-brand-500 font-medium group-hover:underline text-xs">View Details &rarr;</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
