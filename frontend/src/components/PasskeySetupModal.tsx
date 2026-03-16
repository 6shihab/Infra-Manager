import { useState } from 'react';
import { Fingerprint, Check, X } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import api from '../utils/api';
import type { ApiError, PasskeyCredential } from '../types/api';

interface PasskeySetupModalProps {
    open: boolean;
    onClose: () => void;
    onRegistered: () => void;
}

export function PasskeySetupModal({ open, onClose, onRegistered }: PasskeySetupModalProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deviceName, setDeviceName] = useState('My Passkey');
    const [registered, setRegistered] = useState<PasskeyCredential | null>(null);

    const reset = () => {
        setStep(1);
        setLoading(false);
        setError('');
        setDeviceName('My Passkey');
        setRegistered(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleRegister = async () => {
        setLoading(true);
        setError('');
        try {
            // Step 1: Get registration options from server
            const optionsRes = await api.post('/auth/webauthn/register/options');
            const options = optionsRes.data.options;

            // Step 2: Trigger browser/OS WebAuthn ceremony
            const credential = await startRegistration({ optionsJSON: options });

            // Step 3: Send credential to server for verification
            const verifyRes = await api.post('/auth/webauthn/register/verify', {
                credential,
                device_name: deviceName,
            });

            setRegistered(verifyRes.data);
            setStep(2);
        } catch (err: unknown) {
            const axiosErr = err as ApiError;
            if (axiosErr.response?.data?.detail) {
                const detail = axiosErr.response.data.detail;
                setError(typeof detail === 'string' ? detail : 'Registration failed.');
            } else if (err instanceof Error) {
                if (err.name === 'NotAllowedError') {
                    setError('Registration was cancelled or not allowed by your browser.');
                } else {
                    setError(err.message || 'Passkey registration failed.');
                }
            } else {
                setError('Passkey registration failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDone = () => {
        reset();
        onRegistered();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Fingerprint className="h-6 w-6 text-brand-500" />
                        <h3 className="text-xl font-bold text-white">
                            {step === 1 ? 'Register Passkey' : 'Passkey Registered'}
                        </h3>
                    </div>
                    {step === 1 && (
                        <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 mb-6">
                    {[1, 2].map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${s <= step ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-500'}`}>
                                {s < step ? <Check className="h-4 w-4" /> : s}
                            </div>
                            {s < 2 && <div className={`w-8 h-0.5 ${s < step ? 'bg-brand-600' : 'bg-white/10'}`} />}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}

                {/* Step 1: Name & Register */}
                {step === 1 && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-400">
                            Give your passkey a name to identify it later, then follow the browser prompt to register it.
                        </p>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Passkey Name</label>
                            <input
                                type="text"
                                value={deviceName}
                                onChange={e => setDeviceName(e.target.value)}
                                className="w-full px-4 py-3 bg-black/40 border border-dark-border rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-white placeholder-gray-500 transition-colors"
                                placeholder="e.g. Windows Hello, YubiKey"
                                maxLength={256}
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleRegister}
                                disabled={loading || !deviceName.trim()}
                                className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                        Waiting for browser...
                                    </>
                                ) : (
                                    <>
                                        <Fingerprint className="mr-2 h-4 w-4" />
                                        Register Passkey
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Success */}
                {step === 2 && registered && (
                    <div className="space-y-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-lg text-sm flex items-start gap-3">
                            <Check className="h-5 w-5 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">Passkey registered successfully!</p>
                                <p className="mt-1 text-emerald-400/80">
                                    "{registered.device_name}" is now ready to use for passwordless sign-in.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
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
