import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ===== Existing =====
  getApiUrl: (): Promise<string> =>
    ipcRenderer.invoke('config:getApiUrl'),

  setApiUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('config:setApiUrl', url),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),

  showNativeNotification: (title: string, body: string): void =>
    ipcRenderer.send('notify:show', title, body),

  // ===== Offline Mode =====

  /** Route an API-like request through the local SQLite database */
  offlineRequest: (args: { method: string; endpoint: string; body?: any }): Promise<any> =>
    ipcRenderer.invoke('offline:request', args),

  /** Check if the app is currently connected to the backend */
  getConnectivityStatus: (): Promise<{ isOnline: boolean }> =>
    ipcRenderer.invoke('offline:getStatus'),

  /** Get the number of pending sync queue entries */
  getSyncQueueCount: (): Promise<number> =>
    ipcRenderer.invoke('offline:getSyncQueueCount'),

  /** Trigger a manual sync */
  triggerSync: (): Promise<void> =>
    ipcRenderer.invoke('offline:triggerSync'),

  /** Listen for connectivity state changes from main process */
  onConnectivityChange: (callback: (isOnline: boolean) => void): (() => void) => {
    const handler = (_event: any, isOnline: boolean) => callback(isOnline);
    ipcRenderer.on('connectivity:changed', handler);
    return () => { ipcRenderer.removeListener('connectivity:changed', handler); };
  },

  /** Listen for sync completion events */
  onSyncComplete: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('sync:complete', handler);
    return () => { ipcRenderer.removeListener('sync:complete', handler); };
  },

  /** Listen for sync progress events */
  onSyncProgress: (callback: (progress: { synced: number; total: number }) => void): (() => void) => {
    const handler = (_event: any, progress: { synced: number; total: number }) => callback(progress);
    ipcRenderer.on('sync:progress', handler);
    return () => { ipcRenderer.removeListener('sync:progress', handler); };
  },

  /** Cache session after login — saves token + user to SQLite, triggers sync */
  cacheSession: (token: string, user: { id: string; email: string; full_name: string; is_superuser: boolean }, refreshToken?: string): Promise<any> =>
    ipcRenderer.invoke('offline:cacheSession', token, user, refreshToken),

  /** Get recent sync logs */
  getSyncLogs: (limit?: number): Promise<Array<{ id: number; timestamp: string; level: string; message: string }>> =>
    ipcRenderer.invoke('offline:getSyncLogs', limit),

  /** Clear sync logs */
  clearSyncLogs: (): Promise<void> =>
    ipcRenderer.invoke('offline:clearSyncLogs'),
});
