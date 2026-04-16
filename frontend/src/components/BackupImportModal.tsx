import { useState, useRef } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import { useToast } from './Toast';

interface BackupImportModalProps {
    open: boolean;
    onClose: () => void;
}

interface SummaryEntry {
    total: number;
    new: number;
    existing: number;
}

interface PreviewData {
    summary: Record<string, SummaryEntry>;
    warnings: string[];
}

interface ResultDetail {
    type: string;
    name: string;
    action: 'created' | 'skipped' | 'error';
    message?: string;
}

interface ImportResult {
    created: number;
    skipped: number;
    errors: number;
    details: ResultDetail[];
}

const ENTITY_LABELS: Record<string, string> = {
    users: 'Users',
    groups: 'Groups',
    project_folders: 'Project Folders',
    projects: 'Projects',
    servers: 'Servers',
    database_engines: 'Database Engines',
    components: 'Components',
    settings: 'Settings',
};

function buildFormData(file: File, passphrase: string): FormData {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('passphrase', passphrase);
    return fd;
}

export function BackupImportModal({ open, onClose }: BackupImportModalProps) {
    const toast = useToast();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1 state
    const [file, setFile] = useState<File | null>(null);
    const [passphrase, setPassphrase] = useState('');
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Step 2 state
    const [preview, setPreview] = useState<PreviewData | null>(null);

    // Step 3 state
    const [result, setResult] = useState<ImportResult | null>(null);

    const reset = () => {
        setStep(1);
        setLoading(false);
        setError('');
        setFile(null);
        setPassphrase('');
        setDragging(false);
        setPreview(null);
        setResult(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    // ── Step 1: Preview ────────────────────────────────────────────────────────
    const handlePreview = async () => {
        if (!file) {
            setError('Please select a backup file.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const fd = buildFormData(file, passphrase);
            const res = await api.post('/backup/import/preview', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPreview(res.data);
            setStep(2);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setError(axiosErr.response?.data?.detail || 'Failed to read backup. Check the passphrase and file.');
        } finally {
            setLoading(false);
        }
    };

    // ── Step 2: Import ─────────────────────────────────────────────────────────
    const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        setError('');
        try {
            // Rebuild FormData — the stream from step 1 is already consumed server-side
            const fd = buildFormData(file, passphrase);
            const res = await api.post('/backup/import', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(res.data);
            setStep(3);
            toast.success('Backup imported successfully.');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setError(axiosErr.response?.data?.detail || 'Import failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ── File handling ──────────────────────────────────────────────────────────
    const acceptFile = (f: File) => {
        if (!f.name.endsWith('.json')) {
            setError('Only .json backup files are accepted.');
            return;
        }
        setFile(f);
        setError('');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) acceptFile(f);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) acceptFile(f);
    };

    if (!open) return null;

    // ── Render helpers ─────────────────────────────────────────────────────────
    const stepLabel = (s: number) => ['Upload', 'Preview', 'Done'][s - 1];

    const actionColor = (action: ResultDetail['action']) => {
        if (action === 'created') return 'text-emerald-400';
        if (action === 'error') return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Upload className="h-5 w-5 text-brand-500" />
                        <h3 className="text-lg font-bold text-white">Import Backup</h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 mb-6">
                    {[1, 2, 3].map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${s < step ? 'bg-brand-600 text-white' : s === step ? 'bg-brand-600 text-white ring-2 ring-brand-400/40' : 'bg-white/5 text-gray-500'}`}>
                                {s < step ? <CheckCircle className="h-4 w-4" /> : s}
                            </div>
                            <span className={`text-xs hidden sm:inline ${s === step ? 'text-white' : 'text-gray-500'}`}>{stepLabel(s)}</span>
                            {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-brand-600' : 'bg-white/10'}`} />}
                        </div>
                    ))}
                </div>

                {/* Inline error */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-4 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Step 1: Upload ── */}
                {step === 1 && (
                    <div className="space-y-4">
                        {/* Dropzone */}
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-brand-400 bg-brand-500/5' : 'border-dark-border hover:border-brand-500'}`}
                        >
                            <Upload className="h-8 w-8 text-gray-500 mx-auto mb-3" />
                            {file ? (
                                <p className="text-sm text-white font-medium">{file.name}</p>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-300">Drop your backup file here, or <span className="text-brand-400">browse</span></p>
                                    <p className="text-xs text-gray-500 mt-1">Accepts .json backup files</p>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,application/json"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>

                        {/* Passphrase */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5" htmlFor="import-passphrase">
                                Passphrase <span className="text-gray-500">(leave blank if none)</span>
                            </label>
                            <input
                                id="import-passphrase"
                                type="password"
                                value={passphrase}
                                onChange={e => setPassphrase(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handlePreview()}
                                placeholder="Enter passphrase"
                                className="w-full px-4 py-2 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-600"
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handlePreview}
                                disabled={loading || !file}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {loading ? 'Reading…' : 'Preview'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Preview ── */}
                {step === 2 && preview && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-400">Review what will be imported before confirming.</p>

                        {/* Summary table */}
                        <div className="rounded-lg border border-dark-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white/5 border-b border-dark-border">
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Entity Type</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Total</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">New</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Existing</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(preview.summary).map(([key, counts], idx) => (
                                        <tr key={key} className={`border-b border-dark-border/50 ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                                            <td className="px-4 py-2.5 text-gray-300">{ENTITY_LABELS[key] ?? key}</td>
                                            <td className="px-4 py-2.5 text-right text-white font-medium">{counts.total}</td>
                                            <td className="px-4 py-2.5 text-right text-emerald-400 font-medium">{counts.new}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-400">{counts.existing}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Warnings */}
                        {preview.warnings.length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-400 text-sm space-y-1">
                                <div className="flex items-center gap-2 font-medium mb-1">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>Warnings</span>
                                </div>
                                <ul className="list-disc list-inside space-y-0.5 pl-1">
                                    {preview.warnings.map((w, i) => (
                                        <li key={i} className="text-amber-400/90">{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-between pt-2">
                            <button
                                onClick={() => { setStep(1); setError(''); }}
                                disabled={loading}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-dark-border text-white text-sm font-medium rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {loading ? 'Importing…' : 'Import'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Result ── */}
                {step === 3 && result && (
                    <div className="space-y-4">
                        {/* Counts */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-emerald-400">{result.created}</p>
                                <p className="text-xs text-emerald-400/70 mt-0.5">Created</p>
                            </div>
                            <div className="bg-white/5 border border-dark-border rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-gray-300">{result.skipped}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
                            </div>
                            <div className={`border rounded-lg p-3 text-center ${result.errors > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-dark-border'}`}>
                                <p className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-400' : 'text-gray-300'}`}>{result.errors}</p>
                                <p className={`text-xs mt-0.5 ${result.errors > 0 ? 'text-red-400/70' : 'text-gray-500'}`}>Errors</p>
                            </div>
                        </div>

                        {/* Detail list */}
                        {result.details.length > 0 && (
                            <div className="rounded-lg border border-dark-border overflow-hidden max-h-64 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0">
                                        <tr className="bg-dark-card border-b border-dark-border">
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Name</th>
                                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.details.map((d, i) => (
                                            <tr key={i} className="border-b border-dark-border/50 last:border-0">
                                                <td className="px-4 py-2 text-gray-400">{ENTITY_LABELS[d.type] ?? d.type}</td>
                                                <td className="px-4 py-2 text-gray-300 max-w-[200px] truncate" title={d.name}>{d.name}</td>
                                                <td className={`px-4 py-2 font-medium capitalize ${actionColor(d.action)}`}>
                                                    {d.action}
                                                    {d.message && (
                                                        <span className="ml-1 text-xs font-normal opacity-70" title={d.message}>— {d.message}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
