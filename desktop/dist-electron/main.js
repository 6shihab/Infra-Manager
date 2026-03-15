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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const config_1 = require("./config");
const index_1 = require("./ipc/index");
const index_2 = require("./db/index");
const engine_1 = require("./sync/engine");
// Prevent multiple instances
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
    process.exit(0);
}
let win = null;
let tray = null;
let isQuitting = false;
let syncEngine = null;
// ── Window creation ─────────────────────────────────────────────────────────
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 680,
        show: false, // show only after ready-to-show to avoid white flash
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        // Use a generated icon in assets/ — replace with a real .ico before distributing
        ...(process.platform === 'win32' && {
            icon: getIconPath(),
        }),
    });
    // Show once the renderer is ready
    win.once('ready-to-show', () => win?.show());
    // Minimize to tray instead of closing
    win.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            win?.hide();
        }
    });
    // Inject custom Origin header so FastAPI CORS allows requests from file://
    electron_1.session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders };
        // Only inject for requests to the configured backend (avoid overriding other origins)
        if (!details.url.startsWith('file://')) {
            headers['Origin'] = 'app://infra-manager';
        }
        callback({ requestHeaders: headers });
    });
    // Apply Content-Security-Policy
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self';" +
                        "script-src 'self';" +
                        // Tailwind v4 uses injected <style> tags in some builds
                        "style-src 'self' 'unsafe-inline';" +
                        // Backend URL is user-configured, so allow all HTTPS/HTTP connections
                        "connect-src *;" +
                        "img-src 'self' data:;" +
                        "font-src 'self' data:;"
                ],
            },
        });
    });
    loadRenderer();
}
function loadRenderer() {
    if (!win)
        return;
    const rendererPath = electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'renderer', 'index.html')
        : path.join(__dirname, '../../frontend/dist/index.html');
    win.loadFile(rendererPath).catch((err) => {
        console.error('Failed to load renderer:', err);
    });
}
// ── System tray ──────────────────────────────────────────────────────────────
function createTray() {
    const icon = electron_1.nativeImage.createFromPath(getIconPath());
    tray = new electron_1.Tray(icon.isEmpty() ? electron_1.nativeImage.createEmpty() : icon);
    tray.setToolTip('Infra Manager');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Open Infra Manager',
            click: () => {
                win?.show();
                win?.focus();
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        win?.show();
        win?.focus();
    });
}
function getIconPath() {
    return electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'assets', 'favicon.png')
        : path.join(__dirname, '../../desktop/assets/favicon.png');
}
// ── IPC handlers ─────────────────────────────────────────────────────────────
function registerIpcHandlers() {
    electron_1.ipcMain.handle('config:getApiUrl', () => (0, config_1.readConfig)().apiUrl);
    electron_1.ipcMain.handle('config:setApiUrl', (_event, url) => {
        (0, config_1.writeConfig)({ apiUrl: url });
        if (syncEngine)
            syncEngine.updateApiUrl(url);
    });
    electron_1.ipcMain.handle('app:getVersion', () => electron_1.app.getVersion());
    electron_1.ipcMain.on('notify:show', (_event, title, body) => {
        if (electron_1.Notification.isSupported()) {
            const notif = new electron_1.Notification({
                title,
                body,
                // icon will fall back gracefully if path doesn't exist
                icon: getIconPath(),
            });
            notif.on('click', () => {
                win?.show();
                win?.focus();
            });
            notif.show();
        }
    });
}
// ── Second-instance handler ──────────────────────────────────────────────────
electron_1.app.on('second-instance', () => {
    if (win) {
        win.show();
        win.focus();
    }
});
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(async () => {
    registerIpcHandlers();
    (0, index_1.registerOfflineIpcHandlers)();
    // Initialize SQLite database
    await (0, index_2.getDb)();
    (0, index_2.startAutoSave)();
    createWindow();
    if (win)
        (0, index_1.setMainWindow)(win);
    createTray();
    // Start sync engine
    const config = (0, config_1.readConfig)();
    syncEngine = new engine_1.SyncEngine(config.apiUrl);
    (0, index_1.setSyncEngine)(syncEngine);
    await syncEngine.start();
});
electron_1.app.on('before-quit', () => {
    isQuitting = true;
    if (syncEngine)
        syncEngine.stop();
    (0, index_2.closeDb)();
});
electron_1.app.on('window-all-closed', () => {
    // On Windows, keep the process alive so the tray icon works
    // app.quit() is only called explicitly from the tray menu
});
electron_1.app.on('activate', () => {
    // macOS: re-create window if dock icon is clicked (no-op on Windows)
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
