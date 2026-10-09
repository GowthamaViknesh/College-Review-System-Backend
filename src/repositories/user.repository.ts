import type { Types } from 'mongoose';

import { User } from '../models/user.model';
import { Review } from '../models/review.model';
import { escapeRegex } from '../common/utils/utils';
import { IRole } from '../common/interfaces/role.interface';
import { CreateUserInput, StoredImage, UpdateProfileInput, UserFilter } from '../common/interfaces/user.interface';

// In API responses a user's role is shown as { _id, name } instead of a bare id
const ROLE_NAME = { path: 'role', select: 'roleId name' };

// For permission checks: the user's role together with the permissions it grants
type WithAccess = { role: (Pick<IRole, 'roleId' | 'name' | 'permissions'> & { _id: Types.ObjectId }) | null };
const ROLE_WITH_PERMISSIONS = { path: 'role', select: 'roleId name permissions' };

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

// Functions named ...ByUserId take the public id, the one that arrives in a URL or a token.
// Functions named ...ById take MongoDB's _id, which only the server's own code ever holds.

export function findByUserId(userId: string) {
    return User.findOne({ userId }).populate(ROLE_NAME);
}

export function findById(id: string) {
    return User.findById(id).populate(ROLE_NAME);
}

// Used on every authenticated request to work out what the caller is allowed to do
export function findByUserIdWithAccess(userId: string) {
    return User.findOne({ userId }).populate<WithAccess>(ROLE_WITH_PERMISSIONS);
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

// Records that the user is using the site. Not an edit of the account, so updatedAt is left alone.
export function touchLastActive(id: string, at: Date) {
    return User.updateOne({ _id: id }, { lastActiveAt: at }, { timestamps: false });
}

// Activity was not recorded before lastActiveAt existed, but reviews were always dated. For anyone with
// no recorded activity, the last time they wrote or edited a review is the best evidence there is of when
// they last used the site, so it is filled in from that. Returns how many accounts were changed.
// From now on, writing a review updates lastActiveAt like any other logged-in request.
export async function fillLastActiveFromReviews() {
    const unknown = await User.collection.distinct('_id', { $or: [{ lastActiveAt: null }, { lastActiveAt: { $exists: false } }] });
    if (!unknown.length) return 0;

    const latest = await Review.aggregate<{ _id: unknown; at: Date }>([{ $match: { user: { $in: unknown } } }, { $group: { _id: '$user', at: { $max: '$updatedAt' } } }]);
    if (!latest.length) return 0;

    // The driver is used directly so this does not count as an edit of the account
    const result = await User.collection.bulkWrite(
        latest.map(({ _id, at }) => ({ updateOne: { filter: { _id: _id as never, lastActiveAt: null }, update: { $set: { lastActiveAt: at } } } })),
    );
    return result.modifiedCount;
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

export function updateRoleByUserId(userId: string, role: Types.ObjectId) {
    return User.findOneAndUpdate({ userId }, { role }, { returnDocument: 'after', runValidators: true }).populate(ROLE_NAME);
}

export function deleteByUserId(userId: string) {
    return User.findOneAndDelete({ userId });
}
