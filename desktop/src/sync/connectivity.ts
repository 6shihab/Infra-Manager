import * as http from 'http';
import * as https from 'https';
import * as url from 'url';

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

    start(): void {
        this.check();
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

    async check(): Promise<void> {
        try {
            const reachable = await this.ping();
            this.setOnline(reachable);
        } catch {
            this.setOnline(false);
        }
    }

    private ping(): Promise<boolean> {
        return new Promise((resolve) => {
            const healthUrl = `${this.apiUrl.replace(/\/+$/, '')}/health`;
            const parsed = new URL(healthUrl);
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
                    // Any response (even 4xx/5xx) means server is reachable
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

    private setOnline(online: boolean): void {
        const changed = this._isOnline !== online;
        this._isOnline = online;
        if (changed && this.onChangeCallback) {
            console.log(`[Connectivity] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
            this.onChangeCallback(online);
        }
    }
}
