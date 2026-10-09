import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';
import { DEFAULT_ROLE } from '../common/constants/roles';
import { PERMISSIONS } from '../common/constants/permissions';
import { ApiError, paginationMeta, validationError } from '../common/utils/utils';
import { CreateUserRequest, ListUsersQuery, RegisterInput } from '../common/interfaces/user.interface';

// The API refers to roles by name; the database stores them by id
async function findRoleByName(name: string) {
    const role = await roleRepository.findByName(name);
    if (!role) throw validationError('role', `Role "${name}" does not exist`);
    return role;
}

// Shared by self-registration and by users created by someone else
export async function createUserWithRole(input: RegisterInput, roleName: string) {
    const role = await findRoleByName(roleName);

    const existing = await userRepository.findByEmailOrUsername(input.email, input.username);
    if (existing) {
        const field = existing.email === input.email ? 'email' : 'username';
        throw new ApiError(409, `${field} already exists`);
    }

    return userRepository.create({ ...input, role: role._id });
}

export async function createUser(actorPermissions: Set<string>, { role, ...input }: CreateUserRequest) {
    // Without this, anyone allowed to create users (e.g. a teacher) could create themselves an admin account
    if (role !== DEFAULT_ROLE && !actorPermissions.has(PERMISSIONS.ROLE_ASSIGN)) {
        throw new ApiError(403, `You may only create users with the "${DEFAULT_ROLE}" role`);
    }

    return createUserWithRole(input, role);
}

export async function listUsers({ page, limit, role, search }: ListUsersQuery) {
    const filter = { search, ...(role && { role: (await findRoleByName(role))._id }) };

    const [users, total] = await Promise.all([userRepository.findPage(filter, page, limit), userRepository.count(filter)]);

    return { users, meta: paginationMeta(page, limit, total) };
}

export async function getUserById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
}

export async function updateUserRole(actorId: string, id: string, roleName: string) {
    // Stops an admin from demoting themselves and leaving the system with no admin
    if (actorId === id) throw new ApiError(400, 'You cannot change your own role');

    const role = await findRoleByName(roleName);
    const user = await userRepository.updateRoleById(id, role._id);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
}

export async function deleteUser(actorId: string, id: string) {
    if (actorId === id) throw new ApiError(400, 'You cannot delete your own account');

    const user = await userRepository.deleteById(id);
    if (!user) throw new ApiError(404, 'User not found');
}
