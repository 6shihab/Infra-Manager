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
exports.SyncEngine = void 0;
const index_1 = require("../db/index");
const connectivity_1 = require("./connectivity");
const fullSync_1 = require("./fullSync");
const queueDrainer_1 = require("./queueDrainer");
const index_2 = require("../ipc/index");
const sessionRepo = __importStar(require("../db/repositories/session"));
const syncLogRepo = __importStar(require("../db/repositories/syncLog"));
class SyncEngine {
    connectivity;
    fullSync;
    queueDrainer;
    periodicSyncInterval = null;
    apiUrl;
    token;
    isSyncing = false;
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.token = '';
        this.connectivity = new connectivity_1.ConnectivityMonitor(apiUrl);
        this.fullSync = new fullSync_1.FullSync(apiUrl, '');
        this.queueDrainer = new queueDrainer_1.QueueDrainer(apiUrl, '');
    }
    async start() {
        // Load cached token first
        const db = await (0, index_1.getDb)();
        const session = sessionRepo.getSession(db);
        if (session) {
            this.token = session.token;
            this.fullSync.updateCredentials(this.apiUrl, this.token);
            this.queueDrainer.updateCredentials(this.apiUrl, this.token);
            syncLogRepo.addLog(db, 'info', `Loaded cached session for ${session.email}`);
        }
        else {
            syncLogRepo.addLog(db, 'info', 'No cached session found — waiting for login');
        }
        (0, index_1.saveDb)();
        // Listen for connectivity changes
        this.connectivity.onChange(async (isOnline) => {
            (0, index_2.setOnlineStatus)(isOnline);
            if (isOnline) {
                await this.onReconnect();
            }
        });
        // Register manual sync handler
        (0, index_2.onSyncRequested)(async () => {
            await this.runSync();
        });
        // Await first connectivity check before deciding on initial sync
        await this.connectivity.check();
        this.connectivity.startPolling();
        // Start periodic sync (every 5 minutes while online)
        this.periodicSyncInterval = setInterval(async () => {
            if (this.connectivity.isOnline && this.token) {
                await this.runFullSync();
            }
        }, 5 * 60 * 1000);
        // Initial sync if online and we have a token
        if (this.connectivity.isOnline && this.token) {
            const db2 = await (0, index_1.getDb)();
            syncLogRepo.addLog(db2, 'info', 'Online with cached token — starting initial sync');
            (0, index_1.saveDb)();
            setTimeout(() => this.runFullSync(), 2000);
        }
    }
    stop() {
        this.connectivity.stop();
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
    }
    updateApiUrl(url) {
        this.apiUrl = url;
        this.connectivity.updateApiUrl(url);
        this.fullSync.updateCredentials(url, this.token);
        this.queueDrainer.updateCredentials(url, this.token);
    }
    updateToken(token) {
        this.token = token;
        this.fullSync.updateCredentials(this.apiUrl, token);
        this.queueDrainer.updateCredentials(this.apiUrl, token);
    }
    /** Public method callable from IPC handler after login */
    async triggerFullSync() {
        await this.runFullSync();
    }
    async onReconnect() {
        const db = await (0, index_1.getDb)();
        syncLogRepo.addLog(db, 'info', 'Connection restored — starting sync');
        (0, index_1.saveDb)();
        await this.runSync();
    }
    async runSync() {
        if (this.isSyncing || !this.token)
            return;
        this.isSyncing = true;
        const db = await (0, index_1.getDb)();
        try {
            syncLogRepo.addLog(db, 'info', 'Sync started (drain queue + full sync)');
            (0, index_1.saveDb)();
            // First: drain the queue (push local changes to server)
            const drainResult = await this.queueDrainer.drain(db);
            if (drainResult.authFailed) {
                syncLogRepo.addLog(db, 'error', 'Sync aborted: authentication failed');
                (0, index_1.saveDb)();
                (0, index_2.notifyRenderer)('sync:auth-required');
                return;
            }
            // Then: full sync (pull server state)
            await this.fullSync.run(db);
            syncLogRepo.addLog(db, 'info', 'Sync completed successfully');
            (0, index_1.saveDb)();
            (0, index_2.notifyRenderer)('sync:complete');
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                syncLogRepo.addLog(db, 'error', 'Sync failed: token expired');
                (0, index_1.saveDb)();
                (0, index_2.notifyRenderer)('sync:auth-required');
            }
            else {
                syncLogRepo.addLog(db, 'error', `Sync failed: ${err.message}`);
                (0, index_1.saveDb)();
            }
        }
        finally {
            this.isSyncing = false;
        }
    }
    async runFullSync() {
        if (this.isSyncing || !this.token)
            return;
        this.isSyncing = true;
        const db = await (0, index_1.getDb)();
        try {
            syncLogRepo.addLog(db, 'info', 'Full sync started');
            (0, index_1.saveDb)();
            await this.fullSync.run(db);
            syncLogRepo.addLog(db, 'info', 'Full sync completed');
            (0, index_1.saveDb)();
            (0, index_2.notifyRenderer)('sync:complete');
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                syncLogRepo.addLog(db, 'error', 'Full sync failed: token expired');
                (0, index_1.saveDb)();
                (0, index_2.notifyRenderer)('sync:auth-required');
            }
            else {
                syncLogRepo.addLog(db, 'error', `Full sync failed: ${err.message}`);
                (0, index_1.saveDb)();
            }
        }
        finally {
            this.isSyncing = false;
        }
    }
}
exports.SyncEngine = SyncEngine;
