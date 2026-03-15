"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMainWindow = setMainWindow;
exports.setSyncEngine = setSyncEngine;
exports.notifyRenderer = notifyRenderer;
exports.registerOfflineIpcHandlers = registerOfflineIpcHandlers;
exports.setOnlineStatus = setOnlineStatus;
exports.getOnlineStatus = getOnlineStatus;
exports.onSyncRequested = onSyncRequested;
const electron_1 = require("electron");
const index_1 = require("../db/index");
const offlineApi_1 = require("./offlineApi");
const syncQueueRepo = __importStar(require("../db/repositories/syncQueue"));
const sessionRepo = __importStar(require("../db/repositories/session"));
const syncLogRepo = __importStar(require("../db/repositories/syncLog"));
const index_2 = require("../db/index");
let mainWindow = null;
let _syncEngine = null;
function setMainWindow(win) {
    mainWindow = win;
}
function setSyncEngine(engine) {
    _syncEngine = engine;
}
function notifyRenderer(channel, ...args) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}
function registerOfflineIpcHandlers() {
    // Offline API request handler
    electron_1.ipcMain.handle('offline:request', async (_event, args) => {
        const db = await (0, index_1.getDb)();
        return (0, offlineApi_1.offlineApiDispatcher)(db, args);
    });
    // Get connectivity status (will be updated by sync engine)
    electron_1.ipcMain.handle('offline:getStatus', () => {
        return { isOnline: _isOnline };
    });
    // Get pending sync queue count
    electron_1.ipcMain.handle('offline:getSyncQueueCount', async () => {
        const db = await (0, index_1.getDb)();
        return syncQueueRepo.getPendingCount(db);
    });
    // Trigger manual sync
    electron_1.ipcMain.handle('offline:triggerSync', async () => {
        if (_onSyncRequested) {
            await _onSyncRequested();
        }
        return { ok: true };
    });
    // Cache session after login — saves token + user to SQLite, updates sync engine
    electron_1.ipcMain.handle('offline:cacheSession', async (_event, token, user) => {
        const db = await (0, index_1.getDb)();
        sessionRepo.saveSession(db, {
            user_id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_superuser: user.is_superuser,
            totp_enabled: user.totp_enabled,
            token,
            cached_at: new Date().toISOString(),
        });
        syncLogRepo.addLog(db, 'info', `Session cached for ${user.email}`);
        (0, index_2.saveDb)();
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
    electron_1.ipcMain.handle('offline:getSyncLogs', async (_event, limit) => {
        const db = await (0, index_1.getDb)();
        return syncLogRepo.getRecentLogs(db, limit || 50);
    });
    // Clear sync logs
    electron_1.ipcMain.handle('offline:clearSyncLogs', async () => {
        const db = await (0, index_1.getDb)();
        syncLogRepo.clearLogs(db);
        return { ok: true };
    });
}
// State managed by sync engine
let _isOnline = true;
let _onSyncRequested = null;
function setOnlineStatus(isOnline) {
    const changed = _isOnline !== isOnline;
    _isOnline = isOnline;
    if (changed) {
        notifyRenderer('connectivity:changed', isOnline);
    }
}
function getOnlineStatus() {
    return _isOnline;
}
function onSyncRequested(handler) {
    _onSyncRequested = handler;
}
