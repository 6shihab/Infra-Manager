import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KeySquare, Lock, LogIn } from 'lucide-react';
import api from '../utils/api';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            navigate('/');
        }
    }, [token, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const formData = new URLSearchParams();
        formData.append('username', email); // OAuth2 expects 'username' field
        formData.append('password', password);

        try {
            const response = await api.post('/auth/token', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            login(response.data.access_token);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

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

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-start">
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-4 rounded-md shadow-sm">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Email address</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-black/40 border border-dark-border rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors"
                                placeholder="admin@inframanager.local"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-black/40 border border-dark-border rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors"
                                    placeholder="••••••••"
                                />
                                <Lock className="absolute right-4 top-3.5 h-5 w-5 text-gray-500" />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
                    >
                        <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                            <LogIn className="h-5 w-5 text-brand-300 group-hover:text-brand-200 transition-colors" />
                        </span>
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}
