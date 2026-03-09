import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getApiUrl: (): Promise<string> =>
    ipcRenderer.invoke('config:getApiUrl'),

  setApiUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('config:setApiUrl', url),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),

  showNativeNotification: (title: string, body: string): void =>
    ipcRenderer.send('notify:show', title, body),
});
