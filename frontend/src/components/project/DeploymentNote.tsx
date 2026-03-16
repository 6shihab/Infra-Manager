import { FileText, Pencil, Save } from 'lucide-react';

interface DeploymentNoteProps {
    deploymentNote: string | null;
    canEdit: boolean;
    editingNote: boolean;
    noteText: string;
    savingNote: boolean;
    noteCollapsed: boolean;
    onToggleCollapse: () => void;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onNoteTextChange: (text: string) => void;
    onSaveNote: () => void;
}

export function DeploymentNote({
    deploymentNote,
    canEdit,
    editingNote,
    noteText,
    savingNote,
    noteCollapsed,
    onToggleCollapse,
    onStartEdit,
    onCancelEdit,
    onNoteTextChange,
    onSaveNote,
}: DeploymentNoteProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={onToggleCollapse}
                    className="text-lg font-semibold text-white flex items-center hover:text-gray-300 transition-colors"
                >
                    <FileText className="mr-2 h-5 w-5 text-brand-500" />
                    Deployment Note
                    <svg
                        className={`ml-2 h-4 w-4 transition-transform ${noteCollapsed ? '-rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {canEdit && !editingNote && !noteCollapsed && (
                    <button
                        onClick={onStartEdit}
                        className="text-sm text-brand-500 hover:text-brand-400 flex items-center gap-1"
                    >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                )}
            </div>

            {!noteCollapsed && (
                <div className="glass-panel p-5 rounded-xl">
                    {editingNote ? (
                        <div className="space-y-3">
                            <textarea
                                rows={6}
                                value={noteText}
                                onChange={(e) => onNoteTextChange(e.target.value)}
                                className="w-full px-4 py-3 bg-black/30 border border-dark-border rounded-lg focus:outline-none focus:border-brand-500 text-white placeholder-gray-500 text-sm font-mono"
                                placeholder="Deployment instructions, rollback steps, environment setup notes..."
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={onCancelEdit}
                                    className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 border border-dark-border rounded-lg hover:bg-white/10 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onSaveNote}
                                    disabled={savingNote}
                                    className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {savingNote ? 'Saving...' : <><Save className="mr-2 h-4 w-4" /> Save Note</>}
                                </button>
                            </div>
                        </div>
                    ) : (
                        deploymentNote ? (
                            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{deploymentNote}</p>
                        ) : (
                            <p className="text-sm text-gray-500 italic">No deployment note has been added yet.</p>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
