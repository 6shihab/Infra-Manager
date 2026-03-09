import { useState, useEffect } from 'react';
import { Server, CheckCircle, XCircle, Save, RefreshCw } from 'lucide-react';
import axios from 'axios';

export function ServerConfig() {
    const [url, setUrl] = useState('');
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [version, setVersion] = useState<string | null>(null);

    useEffect(() => {
        if (!window.electronAPI) return;
        window.electronAPI.getApiUrl().then(setUrl);
        window.electronAPI.getAppVersion().then(setVersion);
    }, []);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const trimmed = url.replace(/\/$/, '');
            await axios.get(`${trimmed}/`, { timeout: 5000 });
            setTestResult({ ok: true, message: 'Connection successful' });
        } catch (err: unknown) {
            // A 4xx/5xx from the server still means it's reachable
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
        // Reload so App.tsx re-reads the new URL via IPC
        window.location.reload();
    };

    // Only render inside Electron
    if (!window.electronAPI) return null;

    return (
        <div className="max-w-xl">
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
                        {testing ? 'Testing…' : 'Test Connection'}
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={!url || saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving…' : 'Save & Restart'}
                    </button>
                </div>
            </div>

            {version && (
                <p className="text-xs text-gray-600 mt-4">Infra Manager Desktop v{version}</p>
            )}
        </div>
    );
}
