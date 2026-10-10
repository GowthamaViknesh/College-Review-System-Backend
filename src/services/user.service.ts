import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';
import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';
import * as refreshTokenRepository from '../repositories/refresh-token.repository';
import * as passwordResetRepository from '../repositories/password-reset.repository';
import { ADMIN_ROLE, DEFAULT_ROLE } from '../common/constants/roles';
import { PERMISSIONS } from '../common/constants/permissions';
import { ApiError, paginationMeta, validationError } from '../common/utils/utils';
import { deleteImage } from '../common/utils/image-storage';
import * as authzService from './authz.service';
import { CreateUserRequest, ListUsersQuery, RegisterInput, UpdateUserInput } from '../common/interfaces/user.interface';

// Whoever is making the request: what their role allows, and the college they belong to (if any).
// Built by the controller from the logged-in user.
export interface Actor {
    userId: string;
    permissions: Set<string>;
    // id is MongoDB's, collegeId the public one
    college: { id: string; collegeId: string } | null;
}

// How far someone's user permissions reach.
//  - With role:assign they administer every college: any account, any role, anywhere.
//  - Without it they work inside their own college, on student accounts only. That holds for every
//    user permission (view, create, edit, delete): granting a teacher more of them lets the teacher do
//    more to their own students, never anything to another college's, to other teachers or to admins.
// It is tied to role:assign, not to the role being called "teacher", so a custom role follows the same rule.
const mayPlaceAnyone = (actor: Actor) => actor.permissions.has(PERMISSIONS.ROLE_ASSIGN);

const roleNameOf = (user: { role: unknown }) => (user.role as { name?: string } | null)?.name;
const collegeIdOf = (user: { college: unknown }) => {
    const college = user.college as { _id?: unknown } | null;
    return college?._id ? String(college._id) : null;
};

// A student of the actor's own college: the only accounts someone without role:assign has any say over
const isOwnStudent = (actor: Actor, user: { role: unknown; college: unknown }) =>
    actor.college !== null && roleNameOf(user) === DEFAULT_ROLE && collegeIdOf(user) === actor.college.id;

// The API refers to roles by name; the database stores them by id
async function findRoleByName(name: string) {
    const role = await roleRepository.findByName(name);
    if (!role) throw validationError('role', `Role "${name}" does not exist`);
    return role;
}

// The API refers to colleges by their public id; users are linked to them by MongoDB's
async function findCollege(collegeId: string) {
    const college = await collegeRepository.findByCollegeId(collegeId);
    if (!college) throw validationError('college', 'That college does not exist');
    return college;
}

// Shared by self-registration and by users created by someone else. college is MongoDB's id, or null for none.
async function createUserWithRole(input: Omit<RegisterInput, 'college'>, roleName: string, college: string | null) {
    const role = await findRoleByName(roleName);

    const existing = await userRepository.findByEmailOrUsername(input.email, input.username);
    if (existing) {
        const field = existing.email === input.email ? 'email' : 'username';
        throw new ApiError(409, `${field} already exists`);
    }

    return userRepository.create({ username: input.username, email: input.email, password: input.password, role: role._id, college });
}

// Signing up yourself: always a student, in the college you say you attend
export async function registerUser({ college, ...input }: RegisterInput) {
    return createUserWithRole(input, DEFAULT_ROLE, (await findCollege(college)).id);
}

export async function createUser(actor: Actor, { role, college, ...input }: CreateUserRequest) {
    if (mayPlaceAnyone(actor)) {
        // Everyone belongs to a college except administrators, who look after all of them
        if (!college && role !== ADMIN_ROLE) throw validationError('college', 'Choose the college this person belongs to');
        return createUserWithRole(input, role, college ? (await findCollege(college)).id : null);
    }

    // Without this, anyone allowed to create users (e.g. a teacher) could create themselves an admin account
    if (role !== DEFAULT_ROLE) throw new ApiError(403, `You may only create users with the "${DEFAULT_ROLE}" role`);
    if (!actor.college) throw new ApiError(403, 'You are not assigned to a college yet, so you cannot create accounts. Ask an administrator.');
    // The new student joins the creator's college; naming a different one is refused rather than quietly ignored
    if (college && college !== actor.college.collegeId) throw new ApiError(403, 'You may only create accounts in your own college');

    return createUserWithRole(input, role, actor.college.id);
}

export async function listUsers(actor: Actor, { page, limit, role, college, search }: ListUsersQuery) {
    const nobody = { users: [], meta: paginationMeta(page, limit, 0) };
    let filter: { search?: string; role?: unknown; college?: string };

    if (mayPlaceAnyone(actor)) {
        const collegeDoc = college ? await collegeRepository.findByCollegeId(college) : null;
        // Asking for the users of a college that does not exist is an empty list, not an error
        if (college && !collegeDoc) return nobody;
        filter = { search, ...(role && { role: (await findRoleByName(role))._id }), ...(collegeDoc && { college: collegeDoc.id }) };
    } else {
        // The students of the actor's own college, whatever the query asks for
        const studentRole = await roleRepository.findByName(DEFAULT_ROLE);
        if (!actor.college || !studentRole) return nobody;
        filter = { search, role: studentRole._id, college: actor.college.id };
    }

    const [users, total] = await Promise.all([userRepository.findPage(filter as never, page, limit), userRepository.count(filter as never)]);
    return { users, meta: paginationMeta(page, limit, total) };
}

// From here down, an id parameter is a user's public id (userId)

async function findUser(id: string) {
    const user = await userRepository.findByUserId(id);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
}

// The user someone asked for, if it is within their reach. Anyone outside it is reported as "not found",
// the same as an id that does not exist, so they cannot discover which other accounts there are.
async function findUserWithinReach(actor: Actor, id: string) {
    const user = await findUser(id);
    if (!mayPlaceAnyone(actor) && !isOwnStudent(actor, user)) throw new ApiError(404, 'User not found');
    return user;
}

export function getUserById(actor: Actor, id: string) {
    return findUserWithinReach(actor, id);
}

export async function updateUser(actor: Actor, id: string, { college, ...details }: UpdateUserInput) {
    const user = await findUserWithinReach(actor, id);

    // Which college someone belongs to decides who can see and manage them, so moving them is kept
    // with assigning roles
    if (college !== undefined && !mayPlaceAnyone(actor)) throw new ApiError(403, 'Moving a user to another college needs the role:assign permission');
    const collegeDoc = college === undefined ? null : await findCollege(college);

    const updated = await authzService.updateProfile(user.id, details);
    return collegeDoc ? (await userRepository.setCollegeById(user.id, collegeDoc.id))! : updated;
}

export async function setUserAvatar(actor: Actor, id: string, file: Buffer) {
    const user = await findUserWithinReach(actor, id);
    return authzService.setAvatar(user, file);
}

export async function removeUserAvatar(actor: Actor, id: string) {
    const user = await findUserWithinReach(actor, id);
    return authzService.removeAvatar(user.id, user.avatar);
}

export async function updateUserRole(actorId: string, id: string, roleName: string) {
    // Stops an admin from accidentally demoting themselves and losing access
    if (actorId === id) throw new ApiError(400, 'You cannot change your own role');

    const role = await findRoleByName(roleName);
    const user = await userRepository.updateRoleByUserId(id, role._id);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
}

export async function deleteUser(actor: Actor, id: string) {
    if (actor.userId === id) throw new ApiError(400, 'You cannot delete your own account');

    // Checked before anything is removed: a teacher with user:delete can remove their own students, nobody else
    await findUserWithinReach(actor, id);
    const user = await userRepository.deleteByUserId(id);
    if (!user) throw new ApiError(404, 'User not found');

    // A removed account should not keep influencing college ratings
    // Everything that belonged to the account is linked to it by MongoDB's id, not the public one
    await reviewRepository.deleteByUser(user.id);
    await reviewRepository.removeVotesByUser(user.userId);
    await refreshTokenRepository.deleteByUser(user.id);
    await passwordResetRepository.deleteByUser(user.id);
    if (user.avatar) await deleteImage(user.avatar.publicId);
}
