import type { Types } from 'mongoose';

import { User } from '../models/user.model';
import { escapeRegex } from '../common/utils/utils';
import { IRole } from '../common/interfaces/role.interface';
import { CreateUserInput, StoredImage, UpdateProfileInput, UserFilter } from '../common/interfaces/user.interface';

// In API responses a user's role is shown as { _id, name } instead of a bare id
const ROLE_NAME = { path: 'role', select: 'name' };

// For permission checks: the user's role together with the permissions it grants
type WithAccess = { role: (Pick<IRole, 'name' | 'permissions'> & { _id: Types.ObjectId }) | null };
const ROLE_WITH_PERMISSIONS = { path: 'role', select: 'name permissions' };

function buildFilter({ role, search }: UserFilter) {
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ username: pattern }, { email: pattern }];
    }
    return filter;
}

export function findPage(filter: UserFilter, pageNumber: number, pageSize: number) {
    // How many documents to bypass to reach the requested page
    const skips = pageSize * (pageNumber - 1);

    return User.find(buildFilter(filter))
        .sort({ createdAt: -1, _id: -1 }) // sorting is mandatory for predictable pagination; _id breaks ties
        .skip(skips)
        .limit(pageSize)
        .populate(ROLE_NAME);
}

export function count(filter: UserFilter) {
    return User.countDocuments(buildFilter(filter));
}

export function countByRole(roleId: Types.ObjectId | string) {
    return User.countDocuments({ role: roleId });
}

export function findById(id: string) {
    return User.findById(id).populate(ROLE_NAME);
}

// Used on every authenticated request to work out what the caller is allowed to do
export function findByIdWithAccess(id: string) {
    return User.findById(id).populate<WithAccess>(ROLE_WITH_PERMISSIONS);
}

export function findByEmailOrUsername(email: string, username: string) {
    return User.findOne({ $or: [{ email }, { username }] });
}

// Someone other than this user who already has the email or username
export function findOtherByEmailOrUsername(id: string, { email, username }: UpdateProfileInput) {
    const taken = [...(email ? [{ email }] : []), ...(username ? [{ username }] : [])];
    if (!taken.length) return null;
    return User.findOne({ _id: { $ne: id }, $or: taken });
}

export function findByIdWithPassword(id: string) {
    return User.findById(id).select('+password');
}

export function updateProfileById(id: string, fields: UpdateProfileInput) {
    return User.findByIdAndUpdate(id, fields, { returnDocument: 'after', runValidators: true }).populate(ROLE_NAME);
}

export function setAvatarById(id: string, avatar: StoredImage | null) {
    return User.findByIdAndUpdate(id, { avatar }, { returnDocument: 'after' }).populate(ROLE_NAME);
}

export function findByEmailWithPassword(email: string) {
    return User.findOne({ email }).select('+password').populate(ROLE_NAME);
}

export async function create(input: CreateUserInput) {
    const user = await User.create(input);
    return user.populate(ROLE_NAME);
}

export function updateRoleById(id: string, roleId: Types.ObjectId) {
    return User.findByIdAndUpdate(id, { role: roleId }, { returnDocument: 'after', runValidators: true }).populate(ROLE_NAME);
}

export function deleteById(id: string) {
    return User.findByIdAndDelete(id);
}
