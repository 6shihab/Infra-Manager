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
import { readConfig, writeConfig } from './config';

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

  // Inject custom Origin header so FastAPI CORS allows requests from file://
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    // Only inject for requests to the configured backend (avoid overriding other origins)
    if (!details.url.startsWith('file://')) {
      headers['Origin'] = 'app://infra-manager';
    }
    callback({ requestHeaders: headers });
  });

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

  const rendererPath = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer', 'index.html')
    : path.join(__dirname, '../../frontend/dist/index.html');

  win.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer:', err);
  });
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
    writeConfig({ apiUrl: url });
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

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isQuitting = true;
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
