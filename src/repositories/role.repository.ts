import { Role } from '../models/role.model';
import { IRole } from '../common/interfaces/role.interface';
import type { PermissionName } from '../common/constants/permissions';

type RoleFields = Pick<IRole, 'name' | 'description' | 'permissions'>;

export function findAll() {
    return Role.find().sort({ name: 1 });
}

// roleId is the role's public id, the one that arrives in a URL
export function findByRoleId(roleId: string) {
    return Role.findOne({ roleId });
}

export function findByName(name: string) {
    return Role.findOne({ name });
}

export function create(fields: RoleFields) {
    return Role.create(fields);
}

export function updateByRoleId(roleId: string, fields: Partial<RoleFields>) {
    return Role.findOneAndUpdate({ roleId }, fields, { returnDocument: 'after', runValidators: true });
}

export function deleteByRoleId(roleId: string) {
    return Role.findOneAndDelete({ roleId });
}

// Strips from every role any permission that is no longer defined in code
export function removeUnknownPermissions(known: PermissionName[]) {
    return Role.updateMany({}, { $pull: { permissions: { $nin: known } } });
}

// Creates the role if it is missing and, either way, sets its permissions to exactly the given list
export function upsertWithPermissions(name: string, description: string, permissions: PermissionName[]) {
    return Role.updateOne({ name }, { $set: { permissions }, $setOnInsert: { description } }, { upsert: true });
}

// Creates the role only if no role with that name exists; an existing one is left untouched
export function createIfMissing({ name, ...fields }: RoleFields) {
    return Role.updateOne({ name }, { $setOnInsert: fields }, { upsert: true });
}
