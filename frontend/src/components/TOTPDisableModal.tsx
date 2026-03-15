import { useState } from 'react';
import { Shield, AlertCircle } from 'lucide-react';
import api from '../utils/api';

interface TOTPDisableModalProps {
    open: boolean;
    onClose: () => void;
    onDisabled: () => void;
}

export function TOTPDisableModal({ open, onClose, onDisabled }: TOTPDisableModalProps) {
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setPassword('');
        setCode('');
        setLoading(false);
        setError('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleDisable = async () => {
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/totp/disable', { password, code });
            reset();
            onDisabled();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to disable two-factor authentication.');
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <Shield className="h-6 w-6 text-red-400" />
                    <h3 className="text-xl font-bold text-white">Disable Two-Factor Authentication</h3>
                </div>

                <p className="text-sm text-gray-400 mb-4">
                    Enter your password and a TOTP code from your authenticator app to disable two-factor authentication.
                </p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Current Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500"
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Authenticator Code</label>
                        <input
                            type="text"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white text-center text-lg tracking-[0.3em] font-mono placeholder-gray-500"
                            placeholder="000000"
                            maxLength={6}
                            autoComplete="one-time-code"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDisable}
                        disabled={loading || !password || code.length < 6}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Disabling...' : 'Disable 2FA'}
                    </button>
                </div>
            </div>
        </div>
    );
}
