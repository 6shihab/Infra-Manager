import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import { runMigrations } from './schema';

let db: Database | null = null;

function getDbPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'infra.db');
}

function getSqlWasmPath(): string {
    // In packaged app, sql-wasm.wasm is in node_modules/sql.js/dist/
    // We need to resolve it relative to the app
    const wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    if (fs.existsSync(wasmPath)) return wasmPath;
    // Fallback for development
    const devPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    if (fs.existsSync(devPath)) return devPath;
    // Let sql.js find it itself
    return '';
}

export async function getDb(): Promise<Database> {
    if (db) return db;

    const dbPath = getDbPath();
    const wasmPath = getSqlWasmPath();

    const initOptions: any = {};
    if (wasmPath) {
        initOptions.locateFile = () => wasmPath;
    }

    const SQL = await initSqlJs(initOptions);

    // Load existing database file if it exists
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Enable WAL-like behavior (sql.js doesn't support WAL, but we enable foreign keys)
    db.run('PRAGMA foreign_keys = ON;');

    // Run migrations
    runMigrations(db);

    // Save after migrations
    saveDb();

    return db;
}

export function saveDb(): void {
    if (!db) return;
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

// Auto-save periodically (every 30 seconds)
let saveInterval: NodeJS.Timeout | null = null;

export function startAutoSave(): void {
    if (saveInterval) return;
    saveInterval = setInterval(() => saveDb(), 30_000);
}

export function stopAutoSave(): void {
    if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
    }
}

export function closeDb(): void {
    stopAutoSave();
    if (db) {
        saveDb();
        db.close();
        db = null;
    }
}
