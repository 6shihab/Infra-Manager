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
exports.listComponents = listComponents;
exports.getComponentById = getComponentById;
exports.createComponent = createComponent;
exports.updateComponent = updateComponent;
exports.softDeleteComponent = softDeleteComponent;
exports.upsertComponent = upsertComponent;
const index_1 = require("../index");
const crypto = __importStar(require("crypto"));
function generateUUID() {
    return crypto.randomUUID();
}
function rowToComponent(columns, row) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    obj.is_deleted = obj.is_deleted === 1;
    obj._is_local = obj._is_local === 1;
    if (typeof obj.custom_fields === 'string') {
        try {
            obj.custom_fields = JSON.parse(obj.custom_fields);
        }
        catch {
            obj.custom_fields = {};
        }
    }
    return obj;
}
function listComponents(db, projectId) {
    let sql = 'SELECT * FROM components WHERE is_deleted = 0';
    const params = [];
    if (projectId) {
        sql += ' AND project_id = ?';
        params.push(projectId);
    }
    sql += ' ORDER BY name';
    const result = db.exec(sql, params);
    if (result.length === 0)
        return [];
    return result[0].values.map(row => rowToComponent(result[0].columns, row));
}
function getComponentById(db, id) {
    const result = db.exec('SELECT * FROM components WHERE id = ? AND is_deleted = 0', [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return rowToComponent(result[0].columns, result[0].values[0]);
}
function createComponent(db, data) {
    const id = generateUUID();
    const now = new Date().toISOString();
    const customFields = typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields || {});
    db.run(`INSERT INTO components (id, name, type, custom_fields, project_id, is_deleted, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?)`, [id, data.name, data.type, customFields, data.project_id, now]);
    (0, index_1.saveDb)();
    return { id, ...data, custom_fields: data.custom_fields || {}, is_deleted: false, _is_local: true };
}
function updateComponent(db, id, data) {
    const fields = [];
    const values = [];
    if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
    }
    if (data.type !== undefined) {
        fields.push('type = ?');
        values.push(data.type);
    }
    if (data.custom_fields !== undefined) {
        fields.push('custom_fields = ?');
        values.push(typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields));
    }
    if (fields.length === 0)
        return getComponentById(db, id);
    fields.push('_local_updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    db.run(`UPDATE components SET ${fields.join(', ')} WHERE id = ?`, values);
    (0, index_1.saveDb)();
    return getComponentById(db, id);
}
function softDeleteComponent(db, id) {
    const now = new Date().toISOString();
    db.run('UPDATE components SET is_deleted = 1, deleted_at = ?, _local_updated_at = ? WHERE id = ?', [now, now, id]);
    (0, index_1.saveDb)();
}
function upsertComponent(db, comp) {
    const customFields = typeof comp.custom_fields === 'string' ? comp.custom_fields : JSON.stringify(comp.custom_fields || {});
    db.run(`INSERT OR REPLACE INTO components (id, name, type, custom_fields, project_id, is_deleted, deleted_at, _is_local, _local_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`, [comp.id, comp.name, comp.type, customFields, comp.project_id, comp.is_deleted ? 1 : 0, comp.deleted_at || null]);
}
