import { Link } from 'react-router-dom';
import { Database, KeySquare } from 'lucide-react';
import { CopyButton } from '../CopyButton';
import { SecretField } from '../SecretField';

interface DatabaseEngineData {
    id: string;
    name: string;
    engine: string;
    host: string;
    port?: number;
    can_edit?: boolean;
    username?: string;
    password?: string;
}

interface DatabaseLink {
    database_engine_id: string;
    db_name: string;
    username?: string;
    password?: string;
    database_engine: DatabaseEngineData;
}

interface DatabaseSectionProps {
    projectId: string;
    databaseLinks: DatabaseLink[];
    canEdit: boolean;
    onDeleteDatabase: (dbId: string, dbName: string) => void;
}

export function DatabaseSection({ projectId, databaseLinks, canEdit, onDeleteDatabase }: DatabaseSectionProps) {
    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                    <Database className="mr-2 h-5 w-5 text-brand-500" />
                    Databases ({databaseLinks?.length || 0})
                </h2>
                {canEdit && <Link to={`/projects/${projectId}/databases/new`} className="text-sm text-brand-500 hover:text-brand-400">Attach Database</Link>}
            </div>

            {databaseLinks?.length === 0 && <p className="text-gray-500 text-sm">No databases attached to this project.</p>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {databaseLinks?.map((link) => {
                    const db = link.database_engine;
                    return (
                        <div key={link.database_engine_id} className="glass-panel p-5 rounded-xl">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <div>
                                    <div className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                                        <Database className="w-4 h-4 text-gray-400" />
                                        {db.name}
                                    </div>
                                    <div className="text-sm text-gray-400 font-mono flex items-center gap-2 group/dbname mb-1">
                                        {link.db_name}
                                        <CopyButton text={link.db_name} className="md:opacity-0 md:group-hover/dbname:opacity-100" />
                                    </div>
                                    <div className="text-sm text-gray-400 font-mono flex items-center gap-2 group/host">
                                        {db.host}{db.port ? `:${db.port}` : ''}
                                        <CopyButton text={db.port ? `${db.host}:${db.port}` : db.host} className="md:opacity-0 md:group-hover/host:opacity-100" />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    <div className="px-3 py-1 bg-brand-500/10 text-brand-400 rounded-lg text-sm font-medium border border-brand-500/20">
                                        {db.engine}
                                    </div>
                                    {db.can_edit && (
                                        <Link to={`/databases/${db.id}/edit`} className="text-xs text-white hover:text-gray-300 px-2 py-1 bg-white/5 hover:bg-white/10 border border-dark-border rounded" title="Edit Global Database Engine">
                                            Edit Global
                                        </Link>
                                    )}
                                    {canEdit && (
                                        <button onClick={() => onDeleteDatabase(db.id, db.name)} className="text-xs text-red-500 hover:text-red-400 p-1 bg-red-500/10 hover:bg-red-500/20 rounded" title="Detach DB from Project">
                                            Detach
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-dark-border pt-4 mt-2">
                                {(link.username || link.password) ? (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <KeySquare className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[10px]">Project Specific</span>
                                        </div>
                                        <SecretField
                                            username={link.username}
                                            password={link.password}
                                            label="Database User" />
                                        {(db.username || db.password) && (
                                            <>
                                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2 mt-4">
                                                    <KeySquare className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>
                                                </div>
                                                <SecretField
                                                    username={db.username}
                                                    password={db.password}
                                                    label="Database User" />
                                            </>
                                        )}
                                    </>
                                ) : (db.username || db.password) ? (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <KeySquare className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>
                                        </div>
                                        <SecretField
                                            username={db.username}
                                            password={db.password}
                                            label="Database User" />
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <KeySquare className="w-3 h-3 mr-1.5" /> Authentication
                                        </div>
                                        <p className="text-sm text-gray-500 mt-2">No credentials attached.</p>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
