import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

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
        localStorage.setItem('token', newToken);
        setToken(newToken);
    };

    const logout = async () => {
        if (token) {
            try {
                await api.post('/auth/logout');
            } catch (error) {
                console.error("Error during server logout", error);
            }
        }
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
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
