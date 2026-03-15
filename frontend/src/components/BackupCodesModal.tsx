import { useState } from 'react';
import { KeySquare, Copy, Check, AlertCircle } from 'lucide-react';
import api from '../utils/api';

interface BackupCodesModalProps {
    open: boolean;
    onClose: () => void;
}

export function BackupCodesModal({ open, onClose }: BackupCodesModalProps) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
    const [codesCopied, setCodesCopied] = useState(false);

    const reset = () => {
        setCode('');
        setLoading(false);
        setError('');
        setBackupCodes(null);
        setCodesCopied(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleRegenerate = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/totp/backup-codes', { code });
            setBackupCodes(res.data.backup_codes);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to regenerate backup codes.');
        } finally {
            setLoading(false);
        }
    };

    const copyBackupCodes = async () => {
        if (!backupCodes) return;
        await navigator.clipboard.writeText(backupCodes.join('\n'));
        setCodesCopied(true);
        setTimeout(() => setCodesCopied(false), 2000);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <KeySquare className="h-6 w-6 text-brand-500" />
                    <h3 className="text-xl font-bold text-white">Regenerate Backup Codes</h3>
                </div>

                {!backupCodes ? (
                    <>
                        <p className="text-sm text-gray-400 mb-4">
                            Enter your current authenticator code to generate new backup codes. This will invalidate all existing backup codes.
                        </p>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Authenticator Code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={e => setCode(e.target.value)}
                                className="w-full px-4 py-2 bg-black/40 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white text-center text-lg tracking-[0.3em] font-mono placeholder-gray-500"
                                placeholder="000000"
                                maxLength={6}
                                autoFocus
                                autoComplete="one-time-code"
                            />
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
                                onClick={handleRegenerate}
                                disabled={loading || code.length < 6}
                                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Generating...' : 'Regenerate'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-lg text-sm mb-4">
                            Save these new backup codes in a safe place. Your previous codes are no longer valid.
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            {backupCodes.map((bc, i) => (
                                <div key={i} className="px-3 py-2 bg-black/40 border border-dark-border rounded-lg text-center">
                                    <code className="text-sm font-mono text-white">{bc}</code>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between">
                            <button
                                onClick={copyBackupCodes}
                                className="inline-flex items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-dark-border text-gray-300 text-sm font-medium rounded-lg transition-colors"
                            >
                                {codesCopied ? <><Check className="mr-2 h-4 w-4 text-emerald-400" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy All</>}
                            </button>
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
