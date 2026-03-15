"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // ===== Existing =====
    getApiUrl: () => electron_1.ipcRenderer.invoke('config:getApiUrl'),
    setApiUrl: (url) => electron_1.ipcRenderer.invoke('config:setApiUrl', url),
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    showNativeNotification: (title, body) => electron_1.ipcRenderer.send('notify:show', title, body),
    // ===== Offline Mode =====
    /** Route an API-like request through the local SQLite database */
    offlineRequest: (args) => electron_1.ipcRenderer.invoke('offline:request', args),
    /** Check if the app is currently connected to the backend */
    getConnectivityStatus: () => electron_1.ipcRenderer.invoke('offline:getStatus'),
    /** Get the number of pending sync queue entries */
    getSyncQueueCount: () => electron_1.ipcRenderer.invoke('offline:getSyncQueueCount'),
    /** Trigger a manual sync */
    triggerSync: () => electron_1.ipcRenderer.invoke('offline:triggerSync'),
    /** Listen for connectivity state changes from main process */
    onConnectivityChange: (callback) => {
        const handler = (_event, isOnline) => callback(isOnline);
        electron_1.ipcRenderer.on('connectivity:changed', handler);
        return () => { electron_1.ipcRenderer.removeListener('connectivity:changed', handler); };
    },
    /** Listen for sync completion events */
    onSyncComplete: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('sync:complete', handler);
        return () => { electron_1.ipcRenderer.removeListener('sync:complete', handler); };
    },
    /** Listen for sync progress events */
    onSyncProgress: (callback) => {
        const handler = (_event, progress) => callback(progress);
        electron_1.ipcRenderer.on('sync:progress', handler);
        return () => { electron_1.ipcRenderer.removeListener('sync:progress', handler); };
    },
});
