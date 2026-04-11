import { Database } from 'sql.js';

export function migration007(db: Database): void {
    db.run(`ALTER TABLE project_folders ADD COLUMN parent_id TEXT;`);
}
