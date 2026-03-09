"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getApiUrl: () => electron_1.ipcRenderer.invoke('config:getApiUrl'),
    setApiUrl: (url) => electron_1.ipcRenderer.invoke('config:setApiUrl', url),
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    showNativeNotification: (title, body) => electron_1.ipcRenderer.send('notify:show', title, body),
});
