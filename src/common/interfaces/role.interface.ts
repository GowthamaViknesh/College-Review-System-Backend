import type { PermissionName } from '../constants/permissions';

export interface IRole {
    name: string;
    description: string;
    // Names of the permissions this role grants, e.g. ["review:create"]
    permissions: PermissionName[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateRoleInput {
    name: string;
    description: string;
    permissions: PermissionName[];
}

export type UpdateRoleInput = Partial<CreateRoleInput>;
