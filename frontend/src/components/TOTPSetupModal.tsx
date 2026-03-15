import { useState } from 'react';
import { Shield, Copy, Check, ArrowRight, X } from 'lucide-react';
import api from '../utils/api';

interface TOTPSetupModalProps {
    open: boolean;
    onClose: () => void;
    onEnabled: () => void;
}

export function TOTPSetupModal({ open, onClose, onEnabled }: TOTPSetupModalProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1 data
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [secretCopied, setSecretCopied] = useState(false);

    // Step 2 data
    const [verifyCode, setVerifyCode] = useState('');

    // Step 3 data
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [codesCopied, setCodesCopied] = useState(false);

    const reset = () => {
        setStep(1);
        setLoading(false);
        setError('');
        setQrCode('');
        setSecret('');
        setSecretCopied(false);
        setVerifyCode('');
        setBackupCodes([]);
        setCodesCopied(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleSetup = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/totp/setup');
            setQrCode(res.data.qr_code);
            setSecret(res.data.secret);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to initiate TOTP setup.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/totp/verify', { code: verifyCode });
            setBackupCodes(res.data.backup_codes);
            setStep(3);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const copySecret = async () => {
        await navigator.clipboard.writeText(secret);
        setSecretCopied(true);
        setTimeout(() => setSecretCopied(false), 2000);
    };

    const copyBackupCodes = async () => {
        await navigator.clipboard.writeText(backupCodes.join('\n'));
        setCodesCopied(true);
        setTimeout(() => setCodesCopied(false), 2000);
    };

    const handleDone = () => {
        reset();
        onEnabled();
    };

    // Start setup when modal first opens
    if (open && !qrCode && !loading && !error && step === 1) {
        handleSetup();
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Shield className="h-6 w-6 text-brand-500" />
                        <h3 className="text-xl font-bold text-white">
                            {step === 1 && 'Scan QR Code'}
                            {step === 2 && 'Verify Code'}
                            {step === 3 && 'Save Backup Codes'}
                        </h3>
                    </div>
                    {step !== 3 && (
                        <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 mb-6">
                    {[1, 2, 3].map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${s <= step ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-500'}`}>
                                {s < step ? <Check className="h-4 w-4" /> : s}
                            </div>
                            {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-brand-600' : 'bg-white/10'}`} />}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}

                {/* Step 1: QR Code */}
                {step === 1 && (
                    <div className="space-y-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
                            </div>
                        ) : qrCode ? (
                            <>
                                <p className="text-sm text-gray-400">
                                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).
                                </p>
                                <div className="flex justify-center py-4">
                                    <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48 rounded-lg bg-white p-2" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Or enter this key manually:</p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 px-3 py-2 bg-black/40 border border-dark-border rounded-lg text-sm text-brand-400 font-mono break-all">
                                            {secret}
                                        </code>
                                        <button
                                            onClick={copySecret}
                                            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-dark-border rounded-lg text-gray-400 hover:text-white transition-colors"
                                        >
                                            {secretCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        onClick={() => setStep(2)}
                                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Next <ArrowRight className="ml-2 h-4 w-4" />
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                )}

                {/* Step 2: Verify */}
                {step === 2 && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-400">
                            Enter the 6-digit code shown in your authenticator app to verify setup.
                        </p>
                        <input
                            type="text"
                            value={verifyCode}
                            onChange={e => setVerifyCode(e.target.value)}
                            className="w-full px-4 py-3 bg-black/40 border border-dark-border rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-500"
                            placeholder="000000"
                            maxLength={6}
                            autoFocus
                            autoComplete="one-time-code"
                        />
                        <div className="flex justify-between pt-2">
                            <button
                                onClick={() => { setStep(1); setError(''); setVerifyCode(''); }}
                                className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleVerify}
                                disabled={loading || verifyCode.length < 6}
                                className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Verifying...' : 'Verify & Activate'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Backup Codes */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-lg text-sm">
                            Save these backup codes in a safe place. Each code can only be used once and you will not be able to see them again.
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {backupCodes.map((code, i) => (
                                <div key={i} className="px-3 py-2 bg-black/40 border border-dark-border rounded-lg text-center">
                                    <code className="text-sm font-mono text-white">{code}</code>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between pt-2">
                            <button
                                onClick={copyBackupCodes}
                                className="inline-flex items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-dark-border text-gray-300 text-sm font-medium rounded-lg transition-colors"
                            >
                                {codesCopied ? <><Check className="mr-2 h-4 w-4 text-emerald-400" />Copied!</> : <><Copy className="mr-2 h-4 w-4" />Copy All</>}
                            </button>
                            <button
                                onClick={handleDone}
                                className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
