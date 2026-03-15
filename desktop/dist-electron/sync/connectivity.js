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
exports.ConnectivityMonitor = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const index_1 = require("../db/index");
const syncLogRepo = __importStar(require("../db/repositories/syncLog"));
const index_2 = require("../db/index");
class ConnectivityMonitor {
    _isOnline = true;
    intervalId = null;
    apiUrl;
    onChangeCallback = null;
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
    }
    get isOnline() {
        return this._isOnline;
    }
    onChange(callback) {
        this.onChangeCallback = callback;
    }
    /** Run a single connectivity check (awaitable) */
    async check() {
        try {
            const reachable = await this.ping();
            await this.setOnline(reachable);
        }
        catch {
            await this.setOnline(false);
        }
    }
    /** Start the periodic polling interval (does NOT run an immediate check) */
    startPolling() {
        if (this.intervalId)
            return;
        this.intervalId = setInterval(() => this.check(), 15_000);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    updateApiUrl(newUrl) {
        this.apiUrl = newUrl;
    }
    ping() {
        return new Promise((resolve) => {
            const healthUrl = `${this.apiUrl.replace(/\/+$/, '')}/health`;
            let parsed;
            try {
                parsed = new URL(healthUrl);
            }
            catch {
                resolve(false);
                return;
            }
            const lib = parsed.protocol === 'https:' ? https : http;
            const req = lib.request({
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                timeout: 5000,
            }, (res) => {
                res.resume();
                resolve(true);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
    }
    async setOnline(online) {
        const changed = this._isOnline !== online;
        this._isOnline = online;
        if (changed) {
            console.log(`[Connectivity] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
            try {
                const db = await (0, index_1.getDb)();
                syncLogRepo.addLog(db, online ? 'info' : 'warn', online ? 'Connection restored' : 'Connection lost');
                (0, index_2.saveDb)();
            }
            catch { /* ignore logging errors during startup */ }
            if (this.onChangeCallback) {
                this.onChangeCallback(online);
            }
        }
    }
}
exports.ConnectivityMonitor = ConnectivityMonitor;
