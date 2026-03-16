import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification,
  session,
  nativeImage,
} from 'electron';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import { readConfig, writeConfig } from './config';
import { registerOfflineIpcHandlers, setMainWindow, setSyncEngine } from './ipc/index';
import { getDb, startAutoSave, closeDb } from './db/index';
import { SyncEngine } from './sync/engine';

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let syncEngine: SyncEngine | null = null;
let localServer: http.Server | null = null;
let localServerPort = 0;

// ── Local static server for renderer ─────────────────────────────────────────
// Serves the frontend via http://localhost:<port> instead of file:// so that
// WebAuthn (passkeys) works — the RP ID "localhost" must match the page origin.

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.map':  'application/json',
  '.wasm': 'application/wasm',
};

function startLocalServer(rootDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      // Strip query string and hash
      let urlPath = (req.url || '/').split('?')[0].split('#')[0];
      if (urlPath === '/') urlPath = '/index.html';

      // Prevent path traversal
      const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(rootDir, safePath);

      // Ensure the resolved path stays within rootDir
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for any missing path (hash router
          // doesn't need this, but it's a safe fallback)
          const indexPath = path.join(rootDir, 'index.html');
          fs.readFile(indexPath, (err2, indexData) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    // Listen on a fixed port on localhost only. A fixed port lets the backend
    // include http://127.0.0.1:17170 in its WebAuthn expected_origin list.
    // If the port is taken, fall back to port 0 (OS-assigned).
    const PREFERRED_PORT = 17170;
    // Bind to localhost (not 127.0.0.1) — WebAuthn requires RP ID to match a
    // registrable domain. "localhost" is special-cased by browsers for WebAuthn,
    // but the IP address 127.0.0.1 is NOT treated as equivalent.
    localServer.listen(PREFERRED_PORT, 'localhost', () => {
      const addr = localServer!.address();
      if (addr && typeof addr === 'object') {
        localServerPort = addr.port;
        console.log(`Local renderer server on http://localhost:${localServerPort}`);
        resolve(localServerPort);
      } else {
        reject(new Error('Failed to get local server address'));
      }
    });

    localServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Preferred port is taken — fall back to a random port
        console.warn(`Port ${PREFERRED_PORT} in use, falling back to random port`);
        localServer!.listen(0, 'localhost', () => {
          const addr = localServer!.address();
          if (addr && typeof addr === 'object') {
            localServerPort = addr.port;
            console.log(`Local renderer server on http://localhost:${localServerPort}`);
            resolve(localServerPort);
          } else {
            reject(new Error('Failed to get local server address'));
          }
        });
      } else {
        reject(err);
      }
    });
  });
}

// ── Window creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  win = new BrowserWindow({
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

  // No Origin header injection needed — the renderer loads from
  // http://localhost:17170 which is in ALLOWED_ORIGINS and WEBAUTHN_ORIGIN.

  // Apply Content-Security-Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
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

function loadRenderer(): void {
  if (!win) return;

  if (localServerPort > 0) {
    // Load from local HTTP server so WebAuthn gets a proper localhost origin
    win.loadURL(`http://localhost:${localServerPort}/`).catch((err) => {
      console.error('Failed to load renderer from local server:', err);
    });
  } else {
    // Fallback to file:// (should not happen in normal flow)
    const rendererPath = app.isPackaged
      ? path.join(process.resourcesPath, 'renderer', 'index.html')
      : path.join(__dirname, '../../frontend/dist/index.html');

    win.loadFile(rendererPath).catch((err) => {
      console.error('Failed to load renderer:', err);
    });
  }
}

// ── System tray ──────────────────────────────────────────────────────────────

function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Infra Manager');

  const contextMenu = Menu.buildFromTemplate([
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
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    win?.show();
    win?.focus();
  });
}

function getIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'favicon.png')
    : path.join(__dirname, '../../desktop/assets/favicon.png');
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle('config:getApiUrl', () => readConfig().apiUrl);

  ipcMain.handle('config:setApiUrl', (_event, url: string) => {
    // Validate URL before persisting
    if (!url || typeof url !== 'string' || url.length > 2048) {
      throw new Error('Invalid API URL: must be a non-empty string (max 2048 chars)');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid API URL: not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid API URL: only http and https protocols are allowed');
    }
    writeConfig({ apiUrl: url });
    if (syncEngine) syncEngine.updateApiUrl(url);
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.on('notify:show', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      const notif = new Notification({
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

app.on('second-instance', () => {
  if (win) {
    win.show();
    win.focus();
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  registerIpcHandlers();
  registerOfflineIpcHandlers();

  // Initialize SQLite database
  await getDb();
  startAutoSave();

  // Start local HTTP server to serve the frontend on localhost.
  // This gives the renderer a proper http://localhost origin so WebAuthn
  // (passkeys) works with rp_id "localhost".
  const rendererDir = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.join(__dirname, '../../frontend/dist');
  try {
    await startLocalServer(rendererDir);
  } catch (err) {
    console.error('Failed to start local renderer server:', err);
  }

  createWindow();
  if (win) setMainWindow(win);
  createTray();

  // Start sync engine
  const config = readConfig();
  syncEngine = new SyncEngine(config.apiUrl);
  setSyncEngine(syncEngine);
  await syncEngine.start();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (syncEngine) syncEngine.stop();
  if (localServer) localServer.close();
  closeDb();
});

app.on('window-all-closed', () => {
  // On Windows, keep the process alive so the tray icon works
  // app.quit() is only called explicitly from the tray menu
});

app.on('activate', () => {
  // macOS: re-create window if dock icon is clicked (no-op on Windows)
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
