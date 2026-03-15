import { useState, useEffect, useCallback } from 'react';
import { Shield, Clock, User, Activity, FileText, Search, Calendar, X, WifiOff } from 'lucide-react';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { Navigate } from 'react-router-dom';
import { Select } from '../components/Select';

const ACTION_OPTIONS = [
    'CREATED', 'UPDATED', 'DELETED', 'LOGIN', 'LOGOUT',
    'GRANTED_ACCESS', 'REVOKED_ACCESS', 'ATTACHED', 'DETACHED',
    'PASSWORD_CHANGED', 'ADMIN_PASSWORD_CHANGED',
];

const RESOURCE_TYPE_OPTIONS = [
    'Project', 'Server', 'DatabaseEngine', 'Component', 'User', 'System',
];

export function AuditLogs() {
    const { user } = useAuth();
    const { isOnline } = useOffline();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    // Filter state
    const [actionFilter, setActionFilter] = useState('');
    const [resourceTypeFilter, setResourceTypeFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchLogs = useCallback(() => {
        if (!user?.is_superuser) return;
        setLoading(true);
        const params = new URLSearchParams();
        if (actionFilter) params.set('action', actionFilter);
        if (resourceTypeFilter) params.set('resource_type', resourceTypeFilter);
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (fromDate) params.set('from_date', new Date(fromDate).toISOString());
        if (toDate) params.set('to_date', new Date(toDate).toISOString());

        api.get(`/audit-logs/?${params.toString()}`)
            .then(res => {
                setLogs(res.data);
                const total = res.headers['x-total-count'];
                if (total) setTotalCount(parseInt(total, 10));
            })
            .catch(err => console.error("Failed to fetch audit logs", err))
            .finally(() => setLoading(false));
    }, [user, actionFilter, resourceTypeFilter, debouncedSearch, fromDate, toDate]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const hasFilters = actionFilter || resourceTypeFilter || searchQuery || fromDate || toDate;

    const clearFilters = () => {
        setActionFilter('');
        setResourceTypeFilter('');
        setSearchQuery('');
        setFromDate('');
        setToDate('');
    };

    if (!user?.is_superuser) {
        return <Navigate to="/" replace />;
    }

    if (!isOnline && window.electronAPI) {
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight flex items-center">
                        <Shield className="w-7 h-7 mr-3 text-brand-400" /> Audit Logs
                    </h1>
                </div>
                <div className="glass-panel p-12 rounded-xl text-center">
                    <WifiOff className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <h2 className="text-lg font-semibold text-white mb-2">Not Available Offline</h2>
                    <p className="text-gray-400">Audit logs are only available when connected to the server.</p>
                </div>
            </div>
        );
    }

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATED': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'DELETED': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'UPDATED': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            case 'LOGIN': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
            case 'LOGOUT': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
            case 'GRANTED_ACCESS': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
            case 'REVOKED_ACCESS': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'ATTACHED': return 'text-teal-400 bg-teal-400/10 border-teal-400/20';
            case 'DETACHED': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
        }
    };

    const inputClass = "px-3 py-2 bg-black/30 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-brand-500";

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center">
                    <Shield className="mr-3 h-6 w-6 text-brand-500" />
                    Audit Logs
                </h1>
                <p className="text-sm text-gray-400 mt-1">Chronological record of user and system activities.</p>
            </div>

            {/* Filter bar */}
            <div className="glass-panel p-4 rounded-xl border border-dark-border">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-500" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`${inputClass} w-full pl-9`}
                            placeholder="Search resource name..."
                        />
                    </div>

                    {/* Action filter */}
                    <Select
                        value={actionFilter}
                        onChange={setActionFilter}
                        options={[{ value: '', label: 'All Actions' }, ...ACTION_OPTIONS.map(a => ({ value: a, label: a }))]}
                        placeholder="All Actions"
                    />

                    {/* Resource type filter */}
                    <Select
                        value={resourceTypeFilter}
                        onChange={setResourceTypeFilter}
                        options={[{ value: '', label: 'All Resource Types' }, ...RESOURCE_TYPE_OPTIONS.map(r => ({ value: r, label: r }))]}
                        placeholder="All Resource Types"
                    />

                    {/* Date range */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                            <input
                                type="datetime-local"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className={`${inputClass} pl-8 text-xs`}
                                title="From date"
                            />
                        </div>
                        <span className="text-gray-500 text-xs">to</span>
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                            <input
                                type="datetime-local"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className={`${inputClass} pl-8 text-xs`}
                                title="To date"
                            />
                        </div>
                    </div>

                    {/* Clear filters */}
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="px-3 py-2 text-sm text-gray-400 hover:text-white bg-white/5 border border-dark-border rounded-lg hover:bg-white/10 transition flex items-center gap-1.5"
                        >
                            <X className="h-3.5 w-3.5" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Result count */}
                <div className="mt-3 text-xs text-gray-500">
                    {loading ? 'Loading...' : `${logs.length} of ${totalCount} log${totalCount !== 1 ? 's' : ''}`}
                    {hasFilters && ' (filtered)'}
                </div>
            </div>

            {/* Table */}
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
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center">
                                        <div className="flex items-center justify-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                                        {hasFilters ? 'No audit logs match the current filters.' : 'No audit logs found.'}
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                                        <div className="flex items-center">
                                            <Clock className="mr-2 h-4 w-4 text-gray-500" />
                                            {formatDateTime(log.timestamp)}
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
