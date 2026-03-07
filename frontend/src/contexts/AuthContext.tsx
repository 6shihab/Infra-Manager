import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { queryClient } from '../main';

interface User {
    id: number;
    email: string;
    full_name: string;
    is_superuser: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            api.get('/auth/me')
                .then(res => {
                    setUser(res.data);
                })
                .catch(() => {
                    // Token invalid or expired
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

    const login = (newToken: string) => {
        queryClient.clear();
        localStorage.setItem('token', newToken);
        setToken(newToken);
    };

    const logout = () => {
        // Clear UI immediately
        const currentToken = token;
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        queryClient.clear();
        // Fire-and-forget backend call for token blacklisting
        if (currentToken) {
            api.post('/auth/logout').catch(() => {});
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
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
