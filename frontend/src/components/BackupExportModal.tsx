import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import api from '../utils/api';
import { useToast } from './Toast';

interface BackupExportModalProps {
    open: boolean;
    onClose: () => void;
    projectId?: string;
}

export function BackupExportModal({ open, onClose, projectId }: BackupExportModalProps) {
    const toast = useToast();
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [passphraseError, setPassphraseError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setPassphrase('');
            setConfirmPassphrase('');
            setPassphraseError('');
            setLoading(false);
        }
    }, [open]);

    if (!open) return null;

    const title = projectId ? 'Export Project' : 'Export Full Backup';
    const endpoint = projectId ? `/backup/export/project/${projectId}` : '/backup/export/full';

    function validate(): boolean {
        if (passphrase.length < 8) {
            setPassphraseError('Passphrase must be at least 8 characters.');
            return false;
        }
        if (passphrase !== confirmPassphrase) {
            setPassphraseError('Passphrases do not match.');
            return false;
        }
        setPassphraseError('');
        return true;
    }

    async function handleExport() {
        if (!validate()) return;

        setLoading(true);
        try {
            const response = await api.post(
                endpoint,
                { passphrase },
                { responseType: 'blob' }
            );

            const contentDisposition = response.headers['content-disposition'] as string | undefined;
            const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            let filename = projectId
                ? `infra-manager-project-${now}.json`
                : `infra-manager-backup-${now}.json`;

            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
                if (match?.[1]) {
                    filename = match[1];
                }
            }

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Export downloaded successfully.');
            onClose();
        } catch (err: unknown) {
            let message = 'Export failed. Please try again.';
            if (
                err &&
                typeof err === 'object' &&
                'response' in err &&
                err.response &&
                typeof err.response === 'object' &&
                'data' in err.response
            ) {
                const data = (err.response as { data: unknown }).data;
                if (data instanceof Blob) {
                    try {
                        const text = await data.text();
                        const parsed = JSON.parse(text) as { detail?: string };
                        if (parsed.detail) message = parsed.detail;
                    } catch {
                        // keep default message
                    }
                } else if (data && typeof data === 'object' && 'detail' in data) {
                    message = String((data as { detail: unknown }).detail);
                }
            }
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1" htmlFor="export-passphrase">
                            Passphrase
                        </label>
                        <input
                            id="export-passphrase"
                            type="password"
                            value={passphrase}
                            onChange={(e) => {
                                setPassphrase(e.target.value);
                                setPassphraseError('');
                            }}
                            placeholder="Min. 8 characters"
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-600 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1" htmlFor="export-confirm-passphrase">
                            Confirm Passphrase
                        </label>
                        <input
                            id="export-confirm-passphrase"
                            type="password"
                            value={confirmPassphrase}
                            onChange={(e) => {
                                setConfirmPassphrase(e.target.value);
                                setPassphraseError('');
                            }}
                            placeholder="Re-enter passphrase"
                            className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-600 transition-colors"
                        />
                    </div>

                    {passphraseError && (
                        <p className="text-sm text-red-400">{passphraseError}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="mt-6">
                    <button
                        onClick={handleExport}
                        disabled={loading || !passphrase || !confirmPassphrase}
                        className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Exporting…
                            </>
                        ) : (
                            <>
                                <Download size={16} />
                                Export
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
