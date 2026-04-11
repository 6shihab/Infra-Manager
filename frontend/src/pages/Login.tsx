import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { KeySquare, WifiOff } from 'lucide-react';

export function Login() {
    const { login, token, loading } = useAuth();
    const { isOnline } = useOffline();
    const navigate = useNavigate();
    const redirected = useRef(false);

    useEffect(() => {
        if (token) {
            navigate('/');
        }
    }, [token, navigate]);

    // Auto-redirect to Keycloak login page
    useEffect(() => {
        if (!loading && !token && !redirected.current) {
            // In Electron offline mode, don't redirect — show fallback UI
            if (window.electronAPI && !isOnline) return;
            redirected.current = true;
            login();
        }
    }, [loading, token, login, isOnline]);

    // Show spinner while loading or redirecting
    if (loading || (!token && !window.electronAPI)) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    // Fallback UI for Electron offline mode only
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

                {window.electronAPI && !isOnline && (
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-lg text-sm flex items-center gap-3">
                        <WifiOff className="h-5 w-5 flex-shrink-0" />
                        <span>You are offline. Sign in requires a connection to the server. If you had a previous session, the app will use cached data automatically.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
