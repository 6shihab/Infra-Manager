import { Shield, Plus, X } from 'lucide-react';
import { Select } from '../Select';

interface GroupAccess {
    id: string;
    group_id: string;
    access_level: string;
}

interface UserAccess {
    id: string;
    user_id: string;
    access_level: string;
}

interface GroupOption {
    id: string;
    name: string;
}

interface UserOption {
    id: string;
    full_name?: string;
    email: string;
}

interface AccessControlSectionProps {
    // Group assignment
    allGroups: GroupOption[];
    groupAccesses: GroupAccess[];
    assigningGroup: boolean;
    selectedGroupId: string;
    selectedAccessLevel: string;
    onToggleAssigningGroup: () => void;
    onSelectedGroupIdChange: (value: string) => void;
    onSelectedAccessLevelChange: (value: string) => void;
    onAssignGroup: () => void;
    onConfirmRemoveGroup: (group: { id: string; name: string }) => void;

    // User assignment
    allUsers: UserOption[];
    userAccesses: UserAccess[];
    createdBy: string;
    assigningUser: boolean;
    selectedUserId: string;
    selectedUserAccessLevel: string;
    onToggleAssigningUser: () => void;
    onSelectedUserIdChange: (value: string) => void;
    onSelectedUserAccessLevelChange: (value: string) => void;
    onAssignUser: () => void;
    onConfirmRemoveUser: (user: { id: string; name: string }) => void;

    // Offline
    offlineElectron: boolean;
}

export function AccessControlSection({
    allGroups,
    groupAccesses,
    assigningGroup,
    selectedGroupId,
    selectedAccessLevel,
    onToggleAssigningGroup,
    onSelectedGroupIdChange,
    onSelectedAccessLevelChange,
    onAssignGroup,
    onConfirmRemoveGroup,
    allUsers,
    userAccesses,
    createdBy,
    assigningUser,
    selectedUserId,
    selectedUserAccessLevel,
    onToggleAssigningUser,
    onSelectedUserIdChange,
    onSelectedUserAccessLevelChange,
    onAssignUser,
    onConfirmRemoveUser,
    offlineElectron,
}: AccessControlSectionProps) {
    const accessLevelOptions = [
        { value: 'Viewer', label: 'Viewer' },
        { value: 'Editor', label: 'Editor' },
        { value: 'Admin', label: 'Admin' },
    ];

    return (
        <div className="mt-12 bg-black/20 border border-brand-500/20 rounded-xl p-6 space-y-8">
            <h2 className="text-xl font-semibold text-white flex items-center">
                <Shield className="mr-2 h-6 w-6 text-brand-500" />
                Access Control
            </h2>

            {/* Groups sub-section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-white">Groups</h3>
                        <p className="text-sm text-gray-400 mt-0.5">Manage which groups have access to this project.</p>
                    </div>
                    <button
                        onClick={onToggleAssigningGroup}
                        disabled={offlineElectron}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        title={offlineElectron ? 'Requires connection' : undefined}
                    >
                        {assigningGroup ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" /> Assign Group</>}
                    </button>
                </div>

                {assigningGroup && (
                    <div className="mb-4 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                        <Select
                            value={selectedGroupId}
                            onChange={onSelectedGroupIdChange}
                            options={allGroups
                                .filter((g) => !groupAccesses?.some((pga) => pga.group_id === g.id))
                                .map((g) => ({ value: g.id, label: g.name }))}
                            placeholder="Select a Group..."
                            className="flex-1"
                        />
                        <Select
                            value={selectedAccessLevel}
                            onChange={onSelectedAccessLevelChange}
                            options={accessLevelOptions}
                            className="w-full sm:w-48"
                        />
                        <button
                            onClick={onAssignGroup}
                            disabled={!selectedGroupId}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            Assign
                        </button>
                    </div>
                )}

                {groupAccesses?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {groupAccesses.map((pga) => {
                            const groupName = allGroups.find(g => g.id === pga.group_id)?.name || `Group ID: ${pga.group_id}`;
                            return (
                                <div key={pga.id} className="glass-panel p-4 rounded-lg flex items-center justify-between group">
                                    <div>
                                        <div className="text-white font-medium mb-1">{groupName}</div>
                                        <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex border bg-white/5 border-white/10 text-gray-300">
                                            {pga.access_level}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onConfirmRemoveGroup({ id: pga.group_id, name: groupName })}
                                        className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
                                        title="Revoke Access"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <span className="text-gray-500 text-sm">No groups have been assigned access to this project.</span>
                    </div>
                )}
            </div>

            {/* Users sub-section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-base font-semibold text-white">Users</h3>
                        <p className="text-sm text-gray-400 mt-0.5">Grant access directly to individual users.</p>
                    </div>
                    <button
                        onClick={onToggleAssigningUser}
                        disabled={offlineElectron}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        title={offlineElectron ? 'Requires connection' : undefined}
                    >
                        {assigningUser ? 'Cancel' : <><Plus className="h-4 w-4 mr-2" /> Assign User</>}
                    </button>
                </div>

                {assigningUser && (
                    <div className="mb-4 p-4 glass-panel border border-brand-500/30 rounded-lg flex flex-col sm:flex-row gap-3">
                        <Select
                            value={selectedUserId}
                            onChange={onSelectedUserIdChange}
                            options={allUsers
                                .filter((u) => !userAccesses?.some((pua) => pua.user_id === u.id) && u.id !== createdBy)
                                .map((u) => ({ value: u.id, label: u.full_name || u.email }))}
                            placeholder="Select a User..."
                            className="flex-1"
                        />
                        <Select
                            value={selectedUserAccessLevel}
                            onChange={onSelectedUserAccessLevelChange}
                            options={accessLevelOptions}
                            className="w-full sm:w-48"
                        />
                        <button
                            onClick={onAssignUser}
                            disabled={!selectedUserId}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            Assign
                        </button>
                    </div>
                )}

                {userAccesses?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {userAccesses.map((pua) => {
                            const u = allUsers.find(u => u.id === pua.user_id);
                            const userName = u ? (u.full_name || u.email) : `User ID: ${pua.user_id}`;
                            return (
                                <div key={pua.id} className="glass-panel p-4 rounded-lg flex items-center justify-between group">
                                    <div>
                                        <div className="text-white font-medium mb-1">{userName}</div>
                                        <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex border bg-white/5 border-white/10 text-gray-300">
                                            {pua.access_level}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onConfirmRemoveUser({ id: pua.user_id, name: userName })}
                                        className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
                                        title="Revoke Access"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <span className="text-gray-500 text-sm">No users have been directly assigned access to this project.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
