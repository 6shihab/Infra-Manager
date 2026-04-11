import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import type { ProjectFolder } from '../types/api';

/** Returns folders as a nested tree (GET /project-folders/) */
export function useProjectFolders() {
    return useQuery<ProjectFolder[]>({
        queryKey: ['project-folders'],
        queryFn: async () => {
            const { data } = await api.get('/project-folders/');
            return data;
        },
    });
}

/** Returns folders as a flat list (GET /project-folders/flat) — for dropdowns and selectors */
export function useProjectFoldersFlat() {
    return useQuery<ProjectFolder[]>({
        queryKey: ['project-folders-flat'],
        queryFn: async () => {
            const { data } = await api.get('/project-folders/flat');
            return data;
        },
    });
}

/** Flatten a tree into a list with depth info for indented dropdowns */
export function flattenTree(folders: ProjectFolder[], depth = 0): Array<ProjectFolder & { depth: number }> {
    const result: Array<ProjectFolder & { depth: number }> = [];
    for (const folder of folders) {
        result.push({ ...folder, depth });
        if (folder.children?.length) {
            result.push(...flattenTree(folder.children, depth + 1));
        }
    }
    return result;
}

/** Filter folder tree to only folders the user created or has project access to */
export function filterFolderTree(
    folders: ProjectFolder[],
    currentUserId?: string,
    isSuperuser?: boolean,
    accessibleFolderIds?: Set<string>,
): ProjectFolder[] {
    if (isSuperuser) return folders;
    return folders
        .map((folder) => {
            const filteredChildren = filterFolderTree(folder.children || [], currentUserId, isSuperuser, accessibleFolderIds);
            const isOwner = !!currentUserId && folder.created_by === currentUserId;
            const hasAccess = !!accessibleFolderIds && accessibleFolderIds.has(folder.id);
            if (isOwner || hasAccess || filteredChildren.length > 0) {
                return { ...folder, children: filteredChildren };
            }
            return null;
        })
        .filter((f): f is ProjectFolder => f !== null);
}

export function useCreateFolder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (folder: { name: string; color?: string; position?: number; parent_id?: string | null }) => {
            const { data } = await api.post('/project-folders/', folder);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-folders'] });
            queryClient.invalidateQueries({ queryKey: ['project-folders-flat'] });
        },
    });
}

export function useUpdateFolder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...update }: { id: string; name?: string; color?: string; position?: number; parent_id?: string | null }) => {
            const { data } = await api.put(`/project-folders/${id}`, update);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-folders'] });
            queryClient.invalidateQueries({ queryKey: ['project-folders-flat'] });
        },
    });
}

export function useDeleteFolder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/project-folders/${id}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-folders'] });
            queryClient.invalidateQueries({ queryKey: ['project-folders-flat'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
}
