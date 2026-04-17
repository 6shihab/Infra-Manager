import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AUTH_TIMEOUT_MS = 10_000; // 10 seconds max wait for auth to resolve

export function ProtectedRoute() {
    const { user, token, loading, login } = useAuth();
    const [timedOut, setTimedOut] = useState(false);

    // Safety net: if we're stuck in loading/spinner state too long, force re-auth
    useEffect(() => {
        if (!loading && !(token && !user)) {
            setTimedOut(false);
            return;
        }
        const timer = setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [loading, token, user]);

    // Timed out waiting for auth — force redirect to login
    if (timedOut) {
        login();
        return (
            <div className="flex items-center justify-center min-h-screen bg-dark-bg">
                <p className="text-gray-400 text-sm">Session expired. Redirecting to login...</p>
            </div>
        );
    }

    if (loading || (token && !user)) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-dark-bg">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
