import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Settings, KeySquare, Users as UsersIcon, Shield, LogOut, Activity, Server, Database, Trash2, Bell } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Projects', path: '/projects', icon: FolderKanban },
    { name: 'Servers', path: '/servers', icon: Server },
    { name: 'Database Engines', path: '/databases', icon: Database },
    { name: 'Trash', path: '/trash', icon: Trash2 },
    { name: 'Settings', path: '/settings', icon: Settings },
];

interface SidebarProps {
    open: boolean;
    onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
    const location = useLocation();
    const { user, logout } = useAuth();

    return (
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-dark-border bg-dark-card/80 backdrop-blur-xl flex flex-col h-full transition-transform duration-300 md:static md:translate-x-0 md:bg-dark-card/50 md:flex-shrink-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="h-16 flex items-center px-6 border-b border-dark-border">
                <div className="flex items-center gap-2 text-brand-500">
                    <KeySquare className="h-6 w-6" />
                    <span className="text-xl font-bold tracking-tight text-white">InfraManager</span>
                </div>
            </div>

            <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            to={item.path}
                            onClick={onClose}
                            className={clsx(
                                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                isActive
                                    ? 'bg-brand-500/10 text-brand-500'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                            )}
                        >
                            <Icon
                                className={clsx(
                                    'flex-shrink-0 h-5 w-5 mr-3 transition-colors duration-200',
                                    isActive ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300'
                                )}
                            />
                            {item.name}
                        </Link>
                    );
                })}

                {user?.is_superuser && (
                    <div className="pt-4 mt-4 border-t border-dark-border space-y-1">
                        <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Administration</p>
                        <Link
                            to="/audit-logs"
                            onClick={onClose}
                            className={clsx(
                                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                location.pathname.startsWith('/audit-logs')
                                    ? 'bg-brand-500/10 text-brand-500'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                            )}
                        >
                            <Activity className={clsx('flex-shrink-0 h-5 w-5 mr-3 transition-colors duration-200', location.pathname.startsWith('/audit-logs') ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300')} />
                            Audit Logs
                        </Link>
                        <Link
                            to="/users"
                            onClick={onClose}
                            className={clsx(
                                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                location.pathname.startsWith('/users')
                                    ? 'bg-brand-500/10 text-brand-500'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                            )}
                        >
                            <UsersIcon className={clsx('flex-shrink-0 h-5 w-5 mr-3 transition-colors duration-200', location.pathname.startsWith('/users') ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300')} />
                            Users
                        </Link>
                        <Link
                            to="/groups"
                            onClick={onClose}
                            className={clsx(
                                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                location.pathname.startsWith('/groups')
                                    ? 'bg-brand-500/10 text-brand-500'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                            )}
                        >
                            <Shield className={clsx('flex-shrink-0 h-5 w-5 mr-3 transition-colors duration-200', location.pathname.startsWith('/groups') ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300')} />
                            Groups
                        </Link>
                        <Link
                            to="/webhooks"
                            onClick={onClose}
                            className={clsx(
                                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                                location.pathname.startsWith('/webhooks')
                                    ? 'bg-brand-500/10 text-brand-500'
                                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
                            )}
                        >
                            <Bell className={clsx('flex-shrink-0 h-5 w-5 mr-3 transition-colors duration-200', location.pathname.startsWith('/webhooks') ? 'text-brand-500' : 'text-gray-500 group-hover:text-gray-300')} />
                            Webhooks
                        </Link>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-dark-border">
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/20 border border-white/5 h-14">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : user?.email?.substring(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.full_name || 'Admin User'}</p>
                        <p className="text-xs text-brand-500 truncate" title={user?.email}>{user?.email}</p>
                    </div>
                    <button
                        onClick={logout}
                        className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0 ml-1"
                        title="Log out"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
