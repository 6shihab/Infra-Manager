import { ipcMain, BrowserWindow } from 'electron';
import { getDb } from '../db/index';
import { offlineApiDispatcher } from './offlineApi';
import * as syncQueueRepo from '../db/repositories/syncQueue';
import * as sessionRepo from '../db/repositories/session';
import * as syncLogRepo from '../db/repositories/syncLog';
import { saveDb } from '../db/index';
import type { SyncEngine } from '../sync/engine';

let mainWindow: BrowserWindow | null = null;
let _syncEngine: SyncEngine | null = null;

export function setMainWindow(win: BrowserWindow): void {
    mainWindow = win;
}

export function setSyncEngine(engine: SyncEngine): void {
    _syncEngine = engine;
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

    // Cache session after login — saves token + user to SQLite, updates sync engine
    ipcMain.handle('offline:cacheSession', async (_event, token: string, user: { id: string; email: string; full_name: string; is_superuser: boolean; totp_enabled: boolean; has_passkeys?: boolean }) => {
        const db = await getDb();
        sessionRepo.saveSession(db, {
            user_id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_superuser: user.is_superuser,
            totp_enabled: user.totp_enabled,
            has_passkeys: user.has_passkeys ?? false,
            token,
            cached_at: new Date().toISOString(),
        });
        syncLogRepo.addLog(db, 'info', `Session cached for ${user.email}`);
        saveDb();

        // Update sync engine token and trigger sync
        if (_syncEngine) {
            _syncEngine.updateToken(token);
            // Trigger a full sync now that we have a valid token
            if (_isOnline) {
                _syncEngine.triggerFullSync();
            }
        }
        return { ok: true };
    });

    // Get sync logs
    ipcMain.handle('offline:getSyncLogs', async (_event, limit?: number) => {
        const db = await getDb();
        return syncLogRepo.getRecentLogs(db, limit || 50);
    });

    // Clear sync logs
    ipcMain.handle('offline:clearSyncLogs', async () => {
        const db = await getDb();
        syncLogRepo.clearLogs(db);
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
