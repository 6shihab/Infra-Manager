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
        // Try to load cached token
        const db = await (0, index_1.getDb)();
        const session = sessionRepo.getSession(db);
        if (session) {
            this.token = session.token;
            this.fullSync.updateCredentials(this.apiUrl, this.token);
            this.queueDrainer.updateCredentials(this.apiUrl, this.token);
        }
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
        // Start connectivity monitoring
        this.connectivity.start();
        // Start periodic sync (every 5 minutes while online)
        this.periodicSyncInterval = setInterval(async () => {
            if (this.connectivity.isOnline && this.token) {
                await this.runFullSync();
            }
        }, 5 * 60 * 1000);
        // Initial sync if online
        if (this.connectivity.isOnline && this.token) {
            // Delay initial sync slightly to let the app finish loading
            setTimeout(() => this.runFullSync(), 3000);
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
    async onReconnect() {
        console.log('[SyncEngine] Reconnected. Starting sync...');
        await this.runSync();
    }
    async runSync() {
        if (this.isSyncing || !this.token)
            return;
        this.isSyncing = true;
        try {
            const db = await (0, index_1.getDb)();
            // First: drain the queue (push local changes to server)
            const drainResult = await this.queueDrainer.drain(db);
            if (drainResult.authFailed) {
                // Token expired — notify renderer
                (0, index_2.notifyRenderer)('sync:auth-required');
                return;
            }
            // Then: full sync (pull server state)
            await this.fullSync.run(db);
            // Notify renderer that sync is complete
            (0, index_2.notifyRenderer)('sync:complete');
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                (0, index_2.notifyRenderer)('sync:auth-required');
            }
            else {
                console.error('[SyncEngine] Sync error:', err.message);
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
        try {
            const db = await (0, index_1.getDb)();
            await this.fullSync.run(db);
            (0, index_2.notifyRenderer)('sync:complete');
        }
        catch (err) {
            if (err.message === 'UNAUTHORIZED') {
                (0, index_2.notifyRenderer)('sync:auth-required');
            }
            else {
                console.error('[SyncEngine] Full sync error:', err.message);
            }
        }
        finally {
            this.isSyncing = false;
        }
    }
}
exports.SyncEngine = SyncEngine;
