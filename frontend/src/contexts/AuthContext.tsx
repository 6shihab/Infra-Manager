import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';
import { queryClient } from '../main';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface User {
    id: string;
    email: string;
    full_name: string;
    is_superuser: boolean;
    totp_enabled: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const lastActivityRef = useRef<number>(Date.now());

    const logout = useCallback(() => {
        const currentToken = localStorage.getItem('token');
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        queryClient.clear();
        // Fire-and-forget with explicit header since localStorage is already cleared
        if (currentToken) {
            api.post('/auth/logout', null, {
                headers: { Authorization: `Bearer ${currentToken}` }
            }).catch(() => {});
        }
    }, []);

    useEffect(() => {
        if (token) {
            api.get('/auth/me')
                .then(res => {
                    setUser(res.data);
                })
                .catch(() => {
                    logout();
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            setUser(null);
            setLoading(false);
        }
    }, [token]);

    // Reset inactivity timer on user interaction
    useEffect(() => {
        const resetActivity = () => { lastActivityRef.current = Date.now(); };
        const events = ['mousemove', 'keydown', 'click', 'scroll'];
        events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));
        return () => events.forEach(e => window.removeEventListener(e, resetActivity));
    }, []);

    // Check inactivity every minute while logged in
    useEffect(() => {
        if (!token) return;
        const interval = setInterval(() => {
            if (Date.now() - lastActivityRef.current > INACTIVITY_TIMEOUT_MS) {
                logout();
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [token, logout]);

    // Auto-logout on 401 responses
    useEffect(() => {
        const id = api.interceptors.response.use(
            (res) => res,
            (error) => {
                if (error.response?.status === 401 && localStorage.getItem('token')) {
                    logout();
                }
                return Promise.reject(error);
            }
        );
        return () => api.interceptors.response.eject(id);
    }, [logout]);

    const login = (newToken: string) => {
        queryClient.clear();
        localStorage.setItem('token', newToken);
        setToken(newToken);
        lastActivityRef.current = Date.now();
    };

    const refreshUser = useCallback(async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data);
        } catch {
            // If refresh fails, don't logout — user might just have a stale session
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
