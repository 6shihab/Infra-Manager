import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth as useOidcAuth } from 'react-oidc-context';
import api from '../utils/api';
import { queryClient } from '../main';

interface User {
    id: string;
    email: string;
    full_name: string;
    is_superuser: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: () => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const oidc = useOidcAuth();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const token = oidc.user?.access_token ?? null;

    // Sync access token into Axios default header
    useEffect(() => {
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete api.defaults.headers.common['Authorization'];
        }
    }, [token]);

    // Fetch local user profile when token changes
    useEffect(() => {
        if (!token) {
            setUser(null);
            setLoading(!oidc.isLoading ? false : true);
            return;
        }

        api.get('/auth/me')
            .then(res => {
                setUser(res.data);
                // Cache session in Electron for offline access
                if (window.electronAPI) {
                    const refreshToken = oidc.user?.refresh_token || '';
                    window.electronAPI.cacheSession(token, res.data, refreshToken).catch(() => {});
                }
            })
            .catch(() => {
                setUser(null);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);

    // Handle OIDC loading state
    useEffect(() => {
        if (!oidc.isLoading && !oidc.isAuthenticated) {
            setLoading(false);
        }
    }, [oidc.isLoading, oidc.isAuthenticated]);

    const login = useCallback(() => {
        queryClient.clear();
        oidc.signinRedirect();
    }, [oidc]);

    const logout = useCallback(() => {
        queryClient.clear();
        setUser(null);
        // Fire-and-forget audit log
        if (token) {
            api.post('/auth/logout').catch(() => {});
        }
        oidc.signoutRedirect();
    }, [oidc, token]);

    // Auto-logout on 401 responses
    useEffect(() => {
        const id = api.interceptors.response.use(
            (res) => res,
            (error) => {
                if (error.response?.status === 401 && oidc.isAuthenticated) {
                    oidc.signinRedirect();
                }
                return Promise.reject(error);
            }
        );
        return () => api.interceptors.response.eject(id);
    }, [oidc]);

    const refreshUser = useCallback(async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);
        } catch {
            // If refresh fails, don't logout
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
