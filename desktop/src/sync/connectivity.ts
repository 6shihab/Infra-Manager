import * as http from 'http';
import * as https from 'https';
import { getDb } from '../db/index';
import * as syncLogRepo from '../db/repositories/syncLog';
import { saveDb } from '../db/index';

export class ConnectivityMonitor {
    private _isOnline = true;
    private intervalId: NodeJS.Timeout | null = null;
    private apiUrl: string;
    private onChangeCallback: ((isOnline: boolean) => void) | null = null;

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
    }

    get isOnline(): boolean {
        return this._isOnline;
    }

    onChange(callback: (isOnline: boolean) => void): void {
        this.onChangeCallback = callback;
    }

    /** Run a single connectivity check (awaitable) */
    async check(): Promise<void> {
        try {
            const reachable = await this.ping();
            await this.setOnline(reachable);
        } catch {
            await this.setOnline(false);
        }
    }

    /** Start the periodic polling interval (does NOT run an immediate check) */
    startPolling(): void {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.check(), 15_000);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    updateApiUrl(newUrl: string): void {
        this.apiUrl = newUrl;
    }

    private ping(): Promise<boolean> {
        return new Promise((resolve) => {
            const healthUrl = `${this.apiUrl.replace(/\/+$/, '')}/health`;
            let parsed: URL;
            try {
                parsed = new URL(healthUrl);
            } catch {
                resolve(false);
                return;
            }
            const lib = parsed.protocol === 'https:' ? https : http;

            const req = lib.request(
                {
                    hostname: parsed.hostname,
                    port: parsed.port,
                    path: parsed.pathname + parsed.search,
                    method: 'GET',
                    timeout: 5000,
                },
                (res) => {
                    res.resume();
                    resolve(true);
                }
            );

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });

            req.end();
        });
    }

    private async setOnline(online: boolean): Promise<void> {
        const changed = this._isOnline !== online;
        this._isOnline = online;
        if (changed) {
            console.log(`[Connectivity] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
            try {
                const db = await getDb();
                syncLogRepo.addLog(db, online ? 'info' : 'warn', online ? 'Connection restored' : 'Connection lost');
                saveDb();
            } catch { /* ignore logging errors during startup */ }
            if (this.onChangeCallback) {
                this.onChangeCallback(online);
            }
        }
    }
}
