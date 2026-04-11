import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { KeySquare, LogIn, WifiOff } from 'lucide-react';

export function Login() {
    const { login, token, loading } = useAuth();
    const { isOnline } = useOffline();
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            navigate('/');
        }
    }, [token, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 glass-panel p-8 sm:p-10 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/20 mb-6">
                        <KeySquare className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">InfraManager</h2>
                    <p className="mt-2 text-sm text-gray-400">Sign in to control your infrastructure</p>
                </div>

                {/* Offline mode warning for Electron */}
                {window.electronAPI && !isOnline && (
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-lg text-sm flex items-center gap-3">
                        <WifiOff className="h-5 w-5 flex-shrink-0" />
                        <span>You are offline. Sign in requires a connection to the server. If you had a previous session, the app will use cached data automatically.</span>
                    </div>
                )}

                <div className="mt-8 space-y-6">
                    <button
                        type="button"
                        onClick={() => login()}
                        disabled={!isOnline && !!window.electronAPI}
                        className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
                    >
                        <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                            <LogIn className="h-5 w-5 text-brand-300 group-hover:text-brand-200 transition-colors" />
                        </span>
                        Sign in with SSO
                    </button>
                    <p className="text-center text-xs text-gray-500">
                        Secured by Keycloak Identity Provider
                    </p>
                </div>
            </div>
        </div>
    );
}
