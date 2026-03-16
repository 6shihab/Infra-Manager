import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { KeySquare, Lock, LogIn, Shield, ArrowLeft, WifiOff, Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import api from '../utils/api';
import type { ApiError } from '../types/api';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // TOTP state
    const [totpRequired, setTotpRequired] = useState(false);
    const [tempToken, setTempToken] = useState('');
    const [totpCode, setTotpCode] = useState('');

    // Passkey state
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const isPasskeyAvailable = typeof window !== 'undefined' && !!window.PublicKeyCredential;

    const { login, token } = useAuth();
    const { isOnline } = useOffline();
    const navigate = useNavigate();

    useEffect(() => {
        if (token) {
            navigate('/');
        }
    }, [token, navigate]);

    // Offline + Electron: try to use cached session
    const [offlineAttempted, setOfflineAttempted] = useState(false);
    useEffect(() => {
        if (!window.electronAPI || isOnline || offlineAttempted || token) return;
        setOfflineAttempted(true);
        // The offline adapter will return cached session from SQLite for GET /auth/me
        // which AuthContext already calls on mount. If it succeeds, token will be set.
        // If not, we show the offline login message below.
    }, [isOnline, offlineAttempted, token]);

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

            if (response.data.requires_totp) {
                setTempToken(response.data.access_token);
                setTotpRequired(true);
                setLoading(false);
                return;
            }

            login(response.data.access_token);
            navigate('/');
        } catch (err: unknown) {
            const axiosErr = err as ApiError;
            if (axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout')) {
                setError('Connection timed out. The server took too long to respond.');
            } else if (!axiosErr.response) {
                setError('Cannot reach the server. Check your connection or server URL.');
            } else {
                const detail = axiosErr.response?.data?.detail;
                setError(typeof detail === 'string' ? detail : 'Login failed. Please check your credentials.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleTotpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await api.post('/auth/totp/login', {
                totp_token: tempToken,
                code: totpCode,
            });

            login(response.data.access_token);
            navigate('/');
        } catch (err: unknown) {
            const axiosErr = err as ApiError;
            if (axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout')) {
                setError('Connection timed out. The server took too long to respond.');
            } else if (!axiosErr.response) {
                setError('Cannot reach the server. Check your connection or server URL.');
            } else {
                const detail = axiosErr.response?.data?.detail;
                setError(typeof detail === 'string' ? detail : 'Invalid code. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        setTotpRequired(false);
        setTempToken('');
        setTotpCode('');
        setError('');
    };

    const handlePasskeyLogin = async () => {
        setError('');
        setPasskeyLoading(true);
        try {
            const optionsRes = await api.post('/auth/webauthn/login/options',
                email ? { email } : undefined
            );
            const options = optionsRes.data.options;

            const credential = await startAuthentication({ optionsJSON: options });

            const verifyRes = await api.post('/auth/webauthn/login/verify', { credential });

            login(verifyRes.data.access_token);
            navigate('/');
        } catch (err: unknown) {
            const axiosErr = err as ApiError;
            if (axiosErr.response?.data?.detail) {
                const detail = axiosErr.response.data.detail;
                setError(typeof detail === 'string' ? detail : 'Passkey sign-in failed.');
            } else if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                    setError('');  // User cancelled — don't show error
                } else {
                    setError(err.message || 'Passkey sign-in failed.');
                }
            } else {
                setError('Passkey sign-in failed.');
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 glass-panel p-8 sm:p-10 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                {!totpRequired ? (
                    <>
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

                            {isPasskeyAvailable && (
                                <>
                                    <div className="flex items-center gap-3 text-gray-500 text-xs">
                                        <div className="flex-1 border-t border-dark-border" />
                                        <span>or</span>
                                        <div className="flex-1 border-t border-dark-border" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handlePasskeyLogin}
                                        disabled={passkeyLoading}
                                        className="group relative w-full flex justify-center py-3 px-4 border border-dark-border text-sm font-medium rounded-xl text-gray-300 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-all disabled:opacity-50"
                                    >
                                        <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                            <Fingerprint className="h-5 w-5 text-brand-400 group-hover:text-brand-300 transition-colors" />
                                        </span>
                                        {passkeyLoading ? 'Waiting for passkey...' : 'Sign in with passkey'}
                                    </button>
                                </>
                            )}
                        </form>
                    </>
                ) : (
                    <>
                        <div className="flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/20 mb-6">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">Two-Factor Authentication</h2>
                            <p className="mt-2 text-sm text-gray-400">Enter the 6-digit code from your authenticator app</p>
                        </div>

                        <form className="mt-8 space-y-6" onSubmit={handleTotpSubmit}>
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-start">
                                    <span>{error}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Authentication Code</label>
                                <input
                                    type="text"
                                    required
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value)}
                                    className="w-full px-4 py-3 bg-black/40 border border-dark-border rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors text-center text-2xl tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    maxLength={8}
                                    autoFocus
                                    autoComplete="one-time-code"
                                />
                                <p className="mt-2 text-xs text-gray-500">You can also enter a backup code</p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !totpCode}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-brand-600 hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 focus:ring-offset-dark-bg transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
                            >
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                    <Shield className="h-5 w-5 text-brand-300 group-hover:text-brand-200 transition-colors" />
                                </span>
                                {loading ? 'Verifying...' : 'Verify'}
                            </button>

                            <button
                                type="button"
                                onClick={handleBackToLogin}
                                className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to sign in
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
