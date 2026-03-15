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
    start() {
        this.check();
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
    async check() {
        try {
            const reachable = await this.ping();
            this.setOnline(reachable);
        }
        catch {
            this.setOnline(false);
        }
    }
    ping() {
        return new Promise((resolve) => {
            const healthUrl = `${this.apiUrl.replace(/\/+$/, '')}/health`;
            const parsed = new URL(healthUrl);
            const lib = parsed.protocol === 'https:' ? https : http;
            const req = lib.request({
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                timeout: 5000,
            }, (res) => {
                // Any response (even 4xx/5xx) means server is reachable
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
    setOnline(online) {
        const changed = this._isOnline !== online;
        this._isOnline = online;
        if (changed && this.onChangeCallback) {
            console.log(`[Connectivity] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
            this.onChangeCallback(online);
        }
    }
}
exports.ConnectivityMonitor = ConnectivityMonitor;
