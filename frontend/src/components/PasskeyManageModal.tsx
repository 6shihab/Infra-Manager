import { useState, useEffect } from 'react';
import { Fingerprint, Pencil, Trash2, Check, X, Plus, Clock, Usb, Smartphone } from 'lucide-react';
import api from '../utils/api';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import type { PasskeyCredential, ApiError } from '../types/api';

interface PasskeyManageModalProps {
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
    onAddNew: () => void;
}

export function PasskeyManageModal({ open, onClose, onChanged, onAddNew }: PasskeyManageModalProps) {
    const toast = useToast();
    const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
    const [loading, setLoading] = useState(true);

    // Rename state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [renaming, setRenaming] = useState(false);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchCredentials = async () => {
        setLoading(true);
        try {
            const res = await api.get('/auth/webauthn/credentials');
            setCredentials(res.data);
        } catch {
            toast.error('Failed to load passkeys.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchCredentials();
        } else {
            setCredentials([]);
            setEditingId(null);
            setDeleteTarget(null);
        }
    }, [open]);

    const handleRename = async (id: string) => {
        if (!editName.trim()) return;
        setRenaming(true);
        try {
            await api.put(`/auth/webauthn/credentials/${id}`, { device_name: editName.trim() });
            setEditingId(null);
            fetchCredentials();
            toast.success('Passkey renamed.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to rename passkey.');
        } finally {
            setRenaming(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/auth/webauthn/credentials/${deleteTarget.id}`);
            setDeleteTarget(null);
            fetchCredentials();
            onChanged();
            toast.success('Passkey deleted.');
        } catch (err: unknown) {
            const detail = (err as ApiError)?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to delete passkey.');
        } finally {
            setDeleting(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getTransportIcon = (transports: string[] | null) => {
        if (!transports || transports.length === 0) return null;
        if (transports.includes('internal')) return <Smartphone className="h-3.5 w-3.5" />;
        if (transports.includes('usb')) return <Usb className="h-3.5 w-3.5" />;
        return null;
    };

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Fingerprint className="h-6 w-6 text-brand-500" />
                            <h3 className="text-xl font-bold text-white">Manage Passkeys</h3>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Credential list */}
                    <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
                            </div>
                        ) : credentials.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No passkeys registered yet.
                            </div>
                        ) : (
                            credentials.map(cred => (
                                <div
                                    key={cred.id}
                                    className="bg-white/5 border border-dark-border rounded-lg p-4 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        {editingId === cred.id ? (
                                            <div className="flex items-center gap-2 flex-1 mr-2">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    className="flex-1 px-3 py-1.5 bg-black/40 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-brand-500"
                                                    autoFocus
                                                    maxLength={256}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleRename(cred.id);
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleRename(cred.id)}
                                                    disabled={renaming || !editName.trim()}
                                                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors disabled:opacity-50"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="p-1.5 text-gray-400 hover:bg-white/5 rounded transition-colors"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <Fingerprint className="h-4 w-4 text-brand-400" />
                                                    <span className="text-white font-medium text-sm">
                                                        {cred.device_name || 'Unnamed Passkey'}
                                                    </span>
                                                    {cred.transports && cred.transports.length > 0 && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/5 text-gray-400 border border-dark-border">
                                                            {getTransportIcon(cred.transports)}
                                                            {cred.transports[0]}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => { setEditingId(cred.id); setEditName(cred.device_name || ''); }}
                                                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                                                        title="Rename"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget({ id: cred.id, name: cred.device_name || 'Unnamed Passkey' })}
                                                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Created {formatDate(cred.created_at)}
                                        </span>
                                        {cred.last_used_at && (
                                            <span>Last used {formatDate(cred.last_used_at)}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-between pt-4 mt-4 border-t border-dark-border">
                        <button
                            onClick={() => { onClose(); onAddNew(); }}
                            className="inline-flex items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-dark-border text-gray-300 text-sm font-medium rounded-lg transition-colors"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Another Passkey
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Passkey"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? You will no longer be able to sign in with this passkey.`}
                confirmLabel="Delete"
                confirmText={deleteTarget?.name}
                loading={deleting}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
}
