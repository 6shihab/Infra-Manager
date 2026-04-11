import { useState } from 'react';
import { X, Plus, Pencil, Trash2, Check, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import { useProjectFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, filterFolderTree } from '../hooks/useProjectFolders';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import type { ProjectFolder } from '../types/api';

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

interface FolderManagerProps {
    open: boolean;
    onClose: () => void;
    currentUserId?: string;
    isSuperuser?: boolean;
    accessibleFolderIds?: Set<string>;
}

function FolderNode({
    folder,
    depth,
    onEdit,
    onDelete,
    onAddChild,
    currentUserId,
    isSuperuser,
}: {
    folder: ProjectFolder;
    depth: number;
    onEdit: (folder: ProjectFolder) => void;
    onDelete: (folder: ProjectFolder) => void;
    onAddChild: (parentId: string) => void;
    currentUserId?: string;
    isSuperuser?: boolean;
}) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = folder.children && folder.children.length > 0;
    const canManage = !!isSuperuser || (!!currentUserId && folder.created_by === currentUserId);

    return (
        <div>
            <div
                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-dark-border group hover:bg-white/8 transition-colors"
                style={{ marginLeft: depth * 20 }}
            >
                {/* Expand/Collapse toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-gray-500 hover:text-gray-300 p-0.5 w-5 flex-shrink-0"
                >
                    {hasChildren ? (
                        expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <span className="w-3.5" />
                    )}
                </button>

                {/* Color dot */}
                <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: folder.color || '#6B7280' }} />

                {/* Name */}
                <span className="flex-1 text-sm text-white truncate">{folder.name}</span>

                {/* Action buttons */}
                <button
                    onClick={() => onAddChild(folder.id)}
                    className="text-gray-500 hover:text-brand-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Add subfolder"
                >
                    <FolderPlus className="h-3.5 w-3.5" />
                </button>
                {canManage && (
                    <>
                        <button
                            onClick={() => onEdit(folder)}
                            className="text-gray-500 hover:text-gray-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => onDelete(folder)}
                            className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
            </div>

            {/* Children */}
            {hasChildren && expanded && (
                <div className="mt-1 space-y-1">
                    {folder.children.map((child) => (
                        <FolderNode
                            key={child.id}
                            folder={child}
                            depth={depth + 1}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onAddChild={onAddChild}
                            currentUserId={currentUserId}
                            isSuperuser={isSuperuser}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FolderManager({ open, onClose, currentUserId, isSuperuser, accessibleFolderIds }: FolderManagerProps) {
    const { data: allFolders = [] } = useProjectFolders();
    const folders = filterFolderTree(allFolders, currentUserId, isSuperuser, accessibleFolderIds);
    const createFolder = useCreateFolder();
    const updateFolder = useUpdateFolder();
    const deleteFolder = useDeleteFolder();
    const toast = useToast();

    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
    const [newParentId, setNewParentId] = useState<string | null>(null);

    const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);

    if (!open) return null;

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        try {
            await createFolder.mutateAsync({ name: trimmed, color: newColor, parent_id: newParentId });
            setNewName('');
            setNewColor(PRESET_COLORS[0]);
            setNewParentId(null);
            toast.success('Folder created');
        } catch {
            toast.error('Failed to create folder');
        }
    };

    const handleAddChild = (parentId: string) => {
        setNewParentId(parentId);
        // Find the parent name for UX feedback
        const findName = (nodes: ProjectFolder[]): string | null => {
            for (const n of nodes) {
                if (n.id === parentId) return n.name;
                if (n.children?.length) {
                    const found = findName(n.children);
                    if (found) return found;
                }
            }
            return null;
        };
        const parentName = findName(folders);
        setNewName('');
        toast.info(`Creating subfolder under "${parentName}"`);
    };

    const startEdit = (folder: ProjectFolder) => {
        setEditingFolder(folder);
        setEditName(folder.name);
        setEditColor(folder.color || PRESET_COLORS[0]);
    };

    const handleSaveEdit = async () => {
        if (!editingFolder || !editName.trim()) return;
        try {
            await updateFolder.mutateAsync({ id: editingFolder.id, name: editName.trim(), color: editColor });
            setEditingFolder(null);
            toast.success('Folder updated');
        } catch {
            toast.error('Failed to update folder');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteFolder.mutateAsync(deleteTarget.id);
            toast.success('Folder deleted');
        } catch {
            toast.error('Failed to delete folder');
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-lg w-full animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-dark-border">
                        <h2 className="text-lg font-bold text-white">Manage Folders</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Add new folder */}
                    <div className="p-5 border-b border-dark-border">
                        {newParentId && (
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-gray-400">Subfolder of:</span>
                                <span className="text-xs text-brand-400 font-medium">
                                    {(() => {
                                        const findName = (nodes: ProjectFolder[]): string | null => {
                                            for (const n of nodes) {
                                                if (n.id === newParentId) return n.name;
                                                if (n.children?.length) { const f = findName(n.children); if (f) return f; }
                                            }
                                            return null;
                                        };
                                        return findName(folders);
                                    })()}
                                </span>
                                <button onClick={() => setNewParentId(null)} className="text-xs text-gray-500 hover:text-gray-300 ml-1">(cancel)</button>
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="flex gap-1.5">
                                {PRESET_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => setNewColor(c)}
                                        className={`h-6 w-6 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                placeholder={newParentId ? 'Subfolder name...' : 'New folder name...'}
                                className="flex-1 px-3 py-2 bg-black/30 border border-dark-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                                maxLength={200}
                            />
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || createFolder.isPending}
                                className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Folder tree */}
                    <div className="p-5 max-h-80 overflow-y-auto space-y-1">
                        {folders.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">No folders yet. Create one above.</p>
                        ) : (
                            folders.map((folder) => (
                                <FolderNode
                                    key={folder.id}
                                    folder={folder}
                                    depth={0}
                                    onEdit={startEdit}
                                    onDelete={(f) => setDeleteTarget({ id: f.id, name: f.name })}
                                    onAddChild={handleAddChild}
                                    currentUserId={currentUserId}
                                    isSuperuser={isSuperuser}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Edit modal */}
            {editingFolder && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl max-w-sm w-full p-5 animate-in zoom-in-95 duration-200 space-y-4">
                        <h3 className="text-base font-bold text-white">Edit Folder</h3>
                        <div className="flex gap-1.5">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setEditColor(c)}
                                    className={`h-6 w-6 rounded-full border-2 transition-all ${editColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                            className="w-full px-3 py-2 bg-black/30 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:border-brand-500"
                            maxLength={200}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingFolder(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveEdit} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" />
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete Folder"
                message="This folder and all its subfolders will be deleted. Projects inside will be moved to Unfiled."
                confirmText={deleteTarget?.name}
                loading={deleting}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
}
