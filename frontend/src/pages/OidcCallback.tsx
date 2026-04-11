import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth as useOidcAuth } from 'react-oidc-context';

export function OidcCallback() {
    const oidc = useOidcAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!oidc.isLoading) {
            if (oidc.isAuthenticated) {
                navigate('/', { replace: true });
            } else {
                navigate('/login', { replace: true });
            }
        }
    }, [oidc.isLoading, oidc.isAuthenticated, navigate]);

    return (
        <div className="flex h-screen items-center justify-center p-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
    );
}
