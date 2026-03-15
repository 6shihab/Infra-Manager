import api from './api';
import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

/**
 * Installs a custom Axios adapter that transparently routes API calls
 * through the Electron IPC → local SQLite database when the app is offline.
 *
 * Only active in Electron mode (window.electronAPI exists).
 * In web mode, this is a no-op.
 */
export function installOfflineAdapter(): void {
    if (!window.electronAPI) return;

    // Store reference to the original default adapter
    const origAdapter = axios.getAdapter('xhr');

    api.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        const { isOnline } = await window.electronAPI!.getConnectivityStatus();

        if (isOnline) {
            // Online: use the default XHR adapter
            return origAdapter(config);
        }

        // Offline: route through IPC → local SQLite
        const baseURL = config.baseURL || '';
        const rawUrl = config.url || '';
        // Strip the baseURL prefix to get just the API path
        const endpoint = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.replace(baseURL, '');
        const method = (config.method || 'GET').toUpperCase();

        let body: any = undefined;
        if (config.data) {
            if (typeof config.data === 'string') {
                try { body = JSON.parse(config.data); } catch { body = config.data; }
            } else {
                body = config.data;
            }
        }

        const result = await window.electronAPI!.offlineRequest({ method, endpoint, body });

        return {
            data: result.data,
            status: result.status || 200,
            statusText: result.status === 200 ? 'OK' : 'Offline',
            headers: result.headers || {},
            config,
        } as AxiosResponse;
    };
}
