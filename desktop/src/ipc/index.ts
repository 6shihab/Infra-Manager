import { ipcMain, BrowserWindow } from 'electron';
import { getDb } from '../db/index';
import { offlineApiDispatcher } from './offlineApi';
import * as syncQueueRepo from '../db/repositories/syncQueue';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
    mainWindow = win;
}

export function notifyRenderer(channel: string, ...args: any[]): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}

export function registerOfflineIpcHandlers(): void {
    // Offline API request handler
    ipcMain.handle('offline:request', async (_event, args: { method: string; endpoint: string; body?: any }) => {
        const db = await getDb();
        return offlineApiDispatcher(db, args);
    });

    // Get connectivity status (will be updated by sync engine)
    ipcMain.handle('offline:getStatus', () => {
        // This is set by the sync engine via setOnlineStatus
        return { isOnline: _isOnline };
    });

    // Get pending sync queue count
    ipcMain.handle('offline:getSyncQueueCount', async () => {
        const db = await getDb();
        return syncQueueRepo.getPendingCount(db);
    });

    // Trigger manual sync
    ipcMain.handle('offline:triggerSync', async () => {
        if (_onSyncRequested) {
            await _onSyncRequested();
        }
        return { ok: true };
    });
}

// State managed by sync engine
let _isOnline = true;
let _onSyncRequested: (() => Promise<void>) | null = null;

export function setOnlineStatus(isOnline: boolean): void {
    const changed = _isOnline !== isOnline;
    _isOnline = isOnline;
    if (changed) {
        notifyRenderer('connectivity:changed', isOnline);
    }
}

export function getOnlineStatus(): boolean {
    return _isOnline;
}

export function onSyncRequested(handler: () => Promise<void>): void {
    _onSyncRequested = handler;
}
