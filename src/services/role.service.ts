import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';
import { ADMIN_ROLE, STARTER_ROLES } from '../common/constants/roles';
import { ApiError, validationError } from '../common/utils/utils';
import { CreateRoleInput, UpdateRoleInput } from '../common/interfaces/role.interface';
import { ALL_PERMISSIONS, PERMISSION_CATALOGUE, isPermission, type PermissionName } from '../common/constants/permissions';

// Rejects names that are not defined in code, and returns the list sorted so roles read consistently
function checkPermissions(names: string[]): PermissionName[] {
    const unknown = names.filter((name) => !isPermission(name));
    if (unknown.length) throw validationError('permissions', `Unknown permission(s): ${unknown.join(', ')}`);
    return (names as PermissionName[]).sort();
}

// Runs at every startup. Keeps the roles in the database consistent with the permissions defined in code:
// permissions that no longer exist are dropped from every role, and the admin role is (re)given all of them,
// so adding a new permission in code can never lock admins out.
export async function syncRoles() {
    await roleRepository.removeUnknownPermissions(ALL_PERMISSIONS);
    await roleRepository.upsertWithPermissions(ADMIN_ROLE, 'Full access to every part of the system', [...ALL_PERMISSIONS].sort());
}

// Used by `npm run seed`: adds the starter roles (teacher, student) that are not there yet
export async function createStarterRoles() {
    for (const role of STARTER_ROLES) {
        await roleRepository.createIfMissing({ ...role, permissions: [...role.permissions].sort() });
    }
}

// Permissions live in code, not the database, so this is just the catalogue of what can be granted
export function listPermissions() {
    return PERMISSION_CATALOGUE;
}

export function listRoles() {
    return roleRepository.findAll();
}

// From here down, an id parameter is a role's public id (roleId)

export async function getRoleById(id: string) {
    const role = await roleRepository.findByRoleId(id);
    if (!role) throw new ApiError(404, 'Role not found');
    return role;
}

export async function createRole(input: CreateRoleInput) {
    if (await roleRepository.findByName(input.name)) throw new ApiError(409, `Role "${input.name}" already exists`);

    return roleRepository.create({ ...input, permissions: checkPermissions(input.permissions) });
}

export async function updateRole(id: string, input: UpdateRoleInput) {
    const role = await getRoleById(id);

    // The one fixed role: if it could be renamed or lose permissions, nobody would be able to undo it
    if (role.name === ADMIN_ROLE) throw new ApiError(403, 'The admin role cannot be changed');

    const isRename = input.name !== undefined && input.name !== role.name;
    if (isRename && (await roleRepository.findByName(input.name!))) {
        throw new ApiError(409, `Role "${input.name}" already exists`);
    }

    const { permissions, ...fields } = input;
    return roleRepository.updateByRoleId(id, { ...fields, ...(permissions && { permissions: checkPermissions(permissions) }) });
}

export async function deleteRole(id: string) {
    const role = await getRoleById(id);
    if (role.name === ADMIN_ROLE) throw new ApiError(403, 'The admin role cannot be deleted');

    // Deleting a role that is in use would leave those users with no role at all
    const usersWithRole = await userRepository.countByRole(role._id);
    if (usersWithRole > 0) {
        throw new ApiError(409, `Role is assigned to ${usersWithRole} user(s); give them another role first`);
    }

    await roleRepository.deleteByRoleId(id);
}
