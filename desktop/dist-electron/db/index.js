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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.saveDb = saveDb;
exports.startAutoSave = startAutoSave;
exports.stopAutoSave = stopAutoSave;
exports.closeDb = closeDb;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const sql_js_1 = __importDefault(require("sql.js"));
const schema_1 = require("./schema");
let db = null;
function getDbPath() {
    const userDataPath = electron_1.app.getPath('userData');
    return path.join(userDataPath, 'infra.db');
}
function getSqlWasmPath() {
    // In packaged app, sql-wasm.wasm is in node_modules/sql.js/dist/
    // We need to resolve it relative to the app
    const wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    if (fs.existsSync(wasmPath))
        return wasmPath;
    // Fallback for development
    const devPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    if (fs.existsSync(devPath))
        return devPath;
    // Let sql.js find it itself
    return '';
}
async function getDb() {
    if (db)
        return db;
    const dbPath = getDbPath();
    const wasmPath = getSqlWasmPath();
    const initOptions = {};
    if (wasmPath) {
        initOptions.locateFile = () => wasmPath;
    }
    const SQL = await (0, sql_js_1.default)(initOptions);
    // Load existing database file if it exists
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    }
    else {
        db = new SQL.Database();
    }
    // Enable WAL-like behavior (sql.js doesn't support WAL, but we enable foreign keys)
    db.run('PRAGMA foreign_keys = ON;');
    // Run migrations
    (0, schema_1.runMigrations)(db);
    // Save after migrations
    saveDb();
    return db;
}
function saveDb() {
    if (!db)
        return;
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}
// Auto-save periodically (every 30 seconds)
let saveInterval = null;
function startAutoSave() {
    if (saveInterval)
        return;
    saveInterval = setInterval(() => saveDb(), 30_000);
}
function stopAutoSave() {
    if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
    }
}
function closeDb() {
    stopAutoSave();
    if (db) {
        saveDb();
        db.close();
        db = null;
    }
}
