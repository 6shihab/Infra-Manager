import { useState, useEffect, useCallback } from 'react';
import { Server, CheckCircle, XCircle, Save, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useOffline } from '../contexts/OfflineContext';

interface SyncLogEntry {
    id: number;
    timestamp: string;
    level: string;
    message: string;
}

export function ServerConfig() {
    const [url, setUrl] = useState('');
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [version, setVersion] = useState<string | null>(null);
    const { isOnline, pendingSyncCount } = useOffline();

    // Sync log state
    const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;
        window.electronAPI.getApiUrl().then(setUrl);
        window.electronAPI.getAppVersion().then(setVersion);
        loadSyncLogs();
    }, []);

    const loadSyncLogs = useCallback(async () => {
        if (!window.electronAPI) return;
        setLogsLoading(true);
        try {
            const logs = await window.electronAPI.getSyncLogs(100);
            setSyncLogs(logs);
        } catch { /* ignore */ }
        setLogsLoading(false);
    }, []);

    // Auto-refresh logs every 5 seconds
    useEffect(() => {
        if (!window.electronAPI) return;
        const interval = setInterval(loadSyncLogs, 5000);
        return () => clearInterval(interval);
    }, [loadSyncLogs]);

    const handleClearLogs = async () => {
        if (!window.electronAPI) return;
        await window.electronAPI.clearSyncLogs();
        setSyncLogs([]);
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const trimmed = url.replace(/\/$/, '');
            await axios.get(`${trimmed}/`, { timeout: 5000 });
            setTestResult({ ok: true, message: 'Connection successful' });
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response) {
                setTestResult({ ok: true, message: 'Connection successful' });
            } else {
                setTestResult({ ok: false, message: 'Could not reach server. Check the URL and network.' });
            }
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!window.electronAPI) return;
        setSaving(true);
        const trimmed = url.replace(/\/$/, '');
        await window.electronAPI.setApiUrl(trimmed);
        setSaving(false);
        window.location.reload();
    };

    if (!window.electronAPI) return null;

    const levelColor = (level: string) => {
        switch (level) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-amber-400';
            default: return 'text-gray-400';
        }
    };

    const levelBg = (level: string) => {
        switch (level) {
            case 'error': return 'bg-red-500/10';
            case 'warn': return 'bg-amber-500/10';
            default: return '';
        }
    };

    return (
        <div className="max-w-2xl space-y-8">
            {/* Backend Connection Section */}
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <Server className="w-6 h-6 text-blue-400" />
                    <div>
                        <h2 className="text-xl font-semibold">Backend Connection</h2>
                        <p className="text-sm text-gray-400">Configure the Infra Manager server URL</p>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">
                            Server URL
                        </label>
                        <input
                            type="url"
                            value={url}
                            onChange={e => { setUrl(e.target.value); setTestResult(null); }}
                            placeholder="http://192.168.1.50:8888"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            The address of the shared backend server all users connect to.
                        </p>
                    </div>

                    {testResult && (
                        <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {testResult.ok
                                ? <CheckCircle className="w-4 h-4 shrink-0" />
                                : <XCircle className="w-4 h-4 shrink-0" />}
                            {testResult.message}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleTest}
                            disabled={!url || testing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
                            {testing ? 'Testing...' : 'Test Connection'}
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={!url || saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save & Restart'}
                        </button>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-white/5">
                        <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            {isOnline ? 'Connected' : 'Offline'}
                        </span>
                        {pendingSyncCount > 0 && (
                            <span className="text-amber-400">{pendingSyncCount} pending sync</span>
                        )}
                        {version && <span className="ml-auto">v{version}</span>}
                    </div>
                </div>
            </div>

            {/* Sync Log Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <ScrollText className="w-5 h-5 text-brand-400" />
                        <div>
                            <h2 className="text-lg font-semibold">Sync Log</h2>
                            <p className="text-xs text-gray-500">Recent sync activity between local database and server</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadSyncLogs}
                            disabled={logsLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        {syncLogs.length > 0 && (
                            <button
                                onClick={handleClearLogs}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-red-400 hover:bg-red-500/10 transition"
                            >
                                <Trash2 className="w-3 h-3" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    {syncLogs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No sync activity yet. Log in and sync to see activity here.
                        </div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                            {syncLogs.map(log => (
                                <div key={log.id} className={`flex items-start gap-3 px-4 py-2.5 text-xs ${levelBg(log.level)}`}>
                                    <span className="text-gray-600 whitespace-nowrap font-mono flex-shrink-0">
                                        {log.timestamp}
                                    </span>
                                    <span className={`uppercase font-semibold w-10 flex-shrink-0 ${levelColor(log.level)}`}>
                                        {log.level}
                                    </span>
                                    <span className="text-gray-300 break-all">
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
