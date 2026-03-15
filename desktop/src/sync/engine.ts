import { getDb, saveDb } from '../db/index';
import { ConnectivityMonitor } from './connectivity';
import { FullSync } from './fullSync';
import { QueueDrainer } from './queueDrainer';
import { setOnlineStatus, notifyRenderer, onSyncRequested } from '../ipc/index';
import * as sessionRepo from '../db/repositories/session';
import * as syncLogRepo from '../db/repositories/syncLog';

export class SyncEngine {
    private connectivity: ConnectivityMonitor;
    private fullSync: FullSync;
    private queueDrainer: QueueDrainer;
    private periodicSyncInterval: NodeJS.Timeout | null = null;
    private apiUrl: string;
    private token: string;
    private isSyncing = false;

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
        this.token = '';
        this.connectivity = new ConnectivityMonitor(apiUrl);
        this.fullSync = new FullSync(apiUrl, '');
        this.queueDrainer = new QueueDrainer(apiUrl, '');
    }

    async start(): Promise<void> {
        // Load cached token first
        const db = await getDb();
        const session = sessionRepo.getSession(db);
        if (session) {
            this.token = session.token;
            this.fullSync.updateCredentials(this.apiUrl, this.token);
            this.queueDrainer.updateCredentials(this.apiUrl, this.token);
            syncLogRepo.addLog(db, 'info', `Loaded cached session for ${session.email}`);
        } else {
            syncLogRepo.addLog(db, 'info', 'No cached session found — waiting for login');
        }
        saveDb();

        // Listen for connectivity changes
        this.connectivity.onChange(async (isOnline) => {
            setOnlineStatus(isOnline);
            if (isOnline) {
                await this.onReconnect();
            }
        });

        // Register manual sync handler
        onSyncRequested(async () => {
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
            const db2 = await getDb();
            syncLogRepo.addLog(db2, 'info', 'Online with cached token — starting initial sync');
            saveDb();
            setTimeout(() => this.runFullSync(), 2000);
        }
    }

    stop(): void {
        this.connectivity.stop();
        if (this.periodicSyncInterval) {
            clearInterval(this.periodicSyncInterval);
            this.periodicSyncInterval = null;
        }
    }

    updateApiUrl(url: string): void {
        this.apiUrl = url;
        this.connectivity.updateApiUrl(url);
        this.fullSync.updateCredentials(url, this.token);
        this.queueDrainer.updateCredentials(url, this.token);
    }

    updateToken(token: string): void {
        this.token = token;
        this.fullSync.updateCredentials(this.apiUrl, token);
        this.queueDrainer.updateCredentials(this.apiUrl, token);
    }

    /** Public method callable from IPC handler after login */
    async triggerFullSync(): Promise<void> {
        await this.runFullSync();
    }

    private async onReconnect(): Promise<void> {
        const db = await getDb();
        syncLogRepo.addLog(db, 'info', 'Connection restored — starting sync');
        saveDb();
        await this.runSync();
    }

    private async runSync(): Promise<void> {
        if (this.isSyncing || !this.token) return;
        this.isSyncing = true;

        const db = await getDb();
        try {
            syncLogRepo.addLog(db, 'info', 'Sync started (drain queue + full sync)');
            saveDb();

            // First: drain the queue (push local changes to server)
            const drainResult = await this.queueDrainer.drain(db);

            if (drainResult.authFailed) {
                syncLogRepo.addLog(db, 'error', 'Sync aborted: authentication failed');
                saveDb();
                notifyRenderer('sync:auth-required');
                return;
            }

            // Then: full sync (pull server state)
            await this.fullSync.run(db);

            syncLogRepo.addLog(db, 'info', 'Sync completed successfully');
            saveDb();
            notifyRenderer('sync:complete');
        } catch (err: any) {
            if (err.message === 'UNAUTHORIZED') {
                syncLogRepo.addLog(db, 'error', 'Sync failed: token expired');
                saveDb();
                notifyRenderer('sync:auth-required');
            } else {
                syncLogRepo.addLog(db, 'error', `Sync failed: ${err.message}`);
                saveDb();
            }
        } finally {
            this.isSyncing = false;
        }
    }

    private async runFullSync(): Promise<void> {
        if (this.isSyncing || !this.token) return;
        this.isSyncing = true;
        const db = await getDb();
        try {
            syncLogRepo.addLog(db, 'info', 'Full sync started');
            saveDb();

            await this.fullSync.run(db);

            syncLogRepo.addLog(db, 'info', 'Full sync completed');
            saveDb();
            notifyRenderer('sync:complete');
        } catch (err: any) {
            if (err.message === 'UNAUTHORIZED') {
                syncLogRepo.addLog(db, 'error', 'Full sync failed: token expired');
                saveDb();
                notifyRenderer('sync:auth-required');
            } else {
                syncLogRepo.addLog(db, 'error', `Full sync failed: ${err.message}`);
                saveDb();
            }
        } finally {
            this.isSyncing = false;
        }
    }
}
