import { Database } from 'sql.js';
import { getDb, saveDb } from '../db/index';
import { ConnectivityMonitor } from './connectivity';
import { FullSync } from './fullSync';
import { QueueDrainer } from './queueDrainer';
import { setOnlineStatus, notifyRenderer, onSyncRequested } from '../ipc/index';
import * as sessionRepo from '../db/repositories/session';

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
        // Try to load cached token
        const db = await getDb();
        const session = sessionRepo.getSession(db);
        if (session) {
            this.token = session.token;
            this.fullSync.updateCredentials(this.apiUrl, this.token);
            this.queueDrainer.updateCredentials(this.apiUrl, this.token);
        }

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

    private async onReconnect(): Promise<void> {
        console.log('[SyncEngine] Reconnected. Starting sync...');
        await this.runSync();
    }

    private async runSync(): Promise<void> {
        if (this.isSyncing || !this.token) return;
        this.isSyncing = true;

        try {
            const db = await getDb();

            // First: drain the queue (push local changes to server)
            const drainResult = await this.queueDrainer.drain(db);

            if (drainResult.authFailed) {
                // Token expired — notify renderer
                notifyRenderer('sync:auth-required');
                return;
            }

            // Then: full sync (pull server state)
            await this.fullSync.run(db);

            // Notify renderer that sync is complete
            notifyRenderer('sync:complete');
        } catch (err: any) {
            if (err.message === 'UNAUTHORIZED') {
                notifyRenderer('sync:auth-required');
            } else {
                console.error('[SyncEngine] Sync error:', err.message);
            }
        } finally {
            this.isSyncing = false;
        }
    }

    private async runFullSync(): Promise<void> {
        if (this.isSyncing || !this.token) return;
        this.isSyncing = true;
        try {
            const db = await getDb();
            await this.fullSync.run(db);
            notifyRenderer('sync:complete');
        } catch (err: any) {
            if (err.message === 'UNAUTHORIZED') {
                notifyRenderer('sync:auth-required');
            } else {
                console.error('[SyncEngine] Full sync error:', err.message);
            }
        } finally {
            this.isSyncing = false;
        }
    }
}
