import { Database } from 'sql.js';

export function migration004(db: Database): void {
    // Add indexes for faster permission lookups and query performance
    db.run('CREATE INDEX IF NOT EXISTS idx_project_group_access_project_id ON project_group_access (project_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_project_group_access_group_id ON project_group_access (group_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_project_user_access_project_id ON project_user_access (project_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_project_user_access_user_id ON project_user_access (user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_components_project_id ON components (project_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_project_server_server_id ON project_server (server_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_project_database_engine_id ON project_database (database_engine_id)');
}
