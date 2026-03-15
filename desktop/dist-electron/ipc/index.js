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
exports.notifyRenderer = notifyRenderer;
exports.registerOfflineIpcHandlers = registerOfflineIpcHandlers;
exports.setOnlineStatus = setOnlineStatus;
exports.getOnlineStatus = getOnlineStatus;
exports.onSyncRequested = onSyncRequested;
const electron_1 = require("electron");
const index_1 = require("../db/index");
const offlineApi_1 = require("./offlineApi");
const syncQueueRepo = __importStar(require("../db/repositories/syncQueue"));
let mainWindow = null;
function setMainWindow(win) {
    mainWindow = win;
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
        // This is set by the sync engine via setOnlineStatus
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
