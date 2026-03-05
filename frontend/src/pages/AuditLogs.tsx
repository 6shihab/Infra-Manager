import { useState, useEffect } from 'react';
import { Shield, Clock, User, Activity, FileText } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export function AuditLogs() {
    const { user } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.is_superuser) {
            api.get('/audit-logs/')
                .then(res => setLogs(res.data))
                .catch(err => console.error("Failed to fetch audit logs", err))
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [user]);

    if (!user?.is_superuser) {
        return <Navigate to="/" replace />;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATED': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'DELETED': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'UPDATED': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            case 'LOGIN': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
            default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center">
                    <Shield className="mr-3 h-6 w-6 text-brand-500" />
                    Audit Logs
                </h1>
                <p className="text-sm text-gray-400 mt-1">Chronological record of user and system activities.</p>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden border border-dark-border">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-dark-border">
                        <thead className="bg-black/20">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-48">Timestamp</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Resource Type</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Resource Name</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border bg-transparent">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                                        No audit logs found.
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                                        <div className="flex items-center">
                                            <Clock className="mr-2 h-4 w-4 text-gray-500" />
                                            {new Date(log.timestamp).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center text-sm text-gray-300">
                                            <User className="mr-2 h-4 w-4 text-gray-500" />
                                            {log.user ? log.user.email : <span className="text-gray-500 italic">System</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-md border ${getActionColor(log.action)}`}>
                                            <Activity className="mr-1.5 h-3.5 w-3.5" />
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300">
                                        <div className="flex items-center">
                                            <FileText className="mr-2 h-4 w-4 text-brand-500/50" />
                                            {log.resource_type}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        {log.resource_name || '-'}
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
