import { useState } from 'react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    loading?: boolean;
    confirmText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', loading = false, confirmText, onConfirm, onCancel }: ConfirmDialogProps) {
    const [inputValue, setInputValue] = useState('');

    if (!open) return null;

    const isConfirmDisabled = loading || (confirmText !== undefined && inputValue !== confirmText);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm mb-4">{message}</p>
                {confirmText !== undefined && (
                    <div className="mb-2">
                        <p className="text-xs text-gray-500 mb-1">
                            Type <span className="font-mono text-gray-300">{confirmText}</span> to confirm:
                        </p>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="w-full px-3 py-2 bg-black/40 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                            placeholder={confirmText}
                            autoFocus
                        />
                    </div>
                )}
                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 bg-transparent hover:bg-white/5 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isConfirmDisabled}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Deleting...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
