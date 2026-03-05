import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
    const { user, token, loading } = useAuth();

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
