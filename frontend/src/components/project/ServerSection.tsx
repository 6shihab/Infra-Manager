import { Link } from 'react-router-dom';
import { Server, Globe, Activity, Info, Lock, X } from 'lucide-react';
import { CopyButton } from '../CopyButton';
import { SecretField } from '../SecretField';

interface ServerData {
    id: string;
    name: string;
    ip_address: string;
    os?: string;
    region?: string;
    is_online: boolean | null;
    last_checked_at?: string;
    can_edit?: boolean;
    username?: string;
    password?: string;
    ssh_key?: string;
}

interface ServerLink {
    server_id: string;
    username?: string;
    password?: string;
    ssh_key?: string;
    server: ServerData;
}

interface ServerSectionProps {
    projectId: string;
    serverLinks: ServerLink[];
    canEdit: boolean;
    onDeleteServer: (serverId: string, serverName: string) => void;
}

export function ServerSection({ projectId, serverLinks, canEdit, onDeleteServer }: ServerSectionProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center">
                    <Server className="mr-2 h-5 w-5 text-brand-500" />
                    Compute Instances ({serverLinks?.length || 0})
                </h2>
                {canEdit && <Link to={`/projects/${projectId}/servers/new`} className="text-sm text-brand-500 hover:text-brand-400">Attach Server</Link>}
            </div>

            {serverLinks?.length === 0 && <p className="text-gray-500 text-sm">No servers attached to this project.</p>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {serverLinks?.map((link) => {
                    const server = link.server;
                    return (
                        <div key={link.server_id} className="glass-panel p-5 rounded-xl">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-start gap-3 group/btn">
                                    <Server className="h-5 w-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h3 className="font-medium text-white group-hover/btn:text-brand-400 transition-colors flex items-center gap-2">
                                            {server.name} ({server.ip_address})
                                            <CopyButton text={server.ip_address} className="opacity-0 group-hover/btn:opacity-100" />
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                            {server.os && <span className="flex items-center"><Info className="w-3 h-3 mr-1" /> {server.os}</span>}
                                            {server.region && <span className="flex items-center"><Globe className="w-3 h-3 mr-1" /> {server.region}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-md cursor-help ${server.is_online === true ? 'bg-emerald-500/10 text-emerald-500' : server.is_online === false ? 'bg-red-500/10 text-red-500' : 'bg-gray-500/10 text-gray-500'}`} title={server.is_online === true ? 'Status: Online' : server.is_online === false ? 'Status: Offline' : server.last_checked_at ? 'Status: Unknown' : 'Status: Pending Check'}>
                                        <Activity className={`w-4 h-4 ${(server.is_online !== null && server.is_online !== false) ? 'animate-pulse' : ''}`} />
                                    </div>
                                    {server.can_edit && (
                                        <Link to={`/servers/${server.id}/edit`} className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 text-white rounded-md transition border border-dark-border" title="Edit Global Server">
                                            Edit Global
                                        </Link>
                                    )}
                                    {canEdit && (
                                        <button onClick={() => onDeleteServer(server.id, server.name)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors" title="Detach Server from Project">
                                            <X className="w-4 h-4" />
                                            <span className="sr-only">Detach</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-dark-border pt-4 mt-2">
                                {(link.username || link.password || link.ssh_key) ? (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <Lock className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-brand-500/20 text-brand-400 rounded text-[10px]">Project Specific</span>
                                        </div>
                                        <SecretField
                                            username={link.username}
                                            password={link.password}
                                            ssh_key={link.ssh_key}
                                            label="SSH / Root" />
                                        {(server.username || server.password || server.ssh_key) && (
                                            <>
                                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2 mt-4">
                                                    <Lock className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>
                                                </div>
                                                <SecretField
                                                    username={server.username}
                                                    password={server.password}
                                                    ssh_key={server.ssh_key}
                                                    label="SSH / Root" />
                                            </>
                                        )}
                                    </>
                                ) : (server.username || server.password || server.ssh_key) ? (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <Lock className="w-3 h-3 mr-1.5" /> Authentication <span className="ml-2 px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded text-[10px]">Global Default</span>
                                        </div>
                                        <SecretField
                                            username={server.username}
                                            password={server.password}
                                            ssh_key={server.ssh_key}
                                            label="SSH / Root" />
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center mb-2">
                                            <Lock className="w-3 h-3 mr-1.5" /> Authentication
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
