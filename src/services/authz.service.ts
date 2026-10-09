import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';
import { createUserWithRole } from './user.service';
import { DEFAULT_ROLE } from '../common/constants/roles';
import { ApiError, signToken, validationError } from '../common/utils/utils';
import { deleteImage, uploadImage } from '../common/utils/image-storage';
import { RegisterInput, UpdateProfileInput } from '../common/interfaces/user.interface';

// Self sign-up never takes a role: everyone starts with the default role, and only someone
// with the right permission can give them a different one afterwards.
export async function register(input: RegisterInput) {
    // Roles are data, so an admin may have removed the default role; that closes self sign-up
    if (!(await roleRepository.findByName(DEFAULT_ROLE))) {
        throw new ApiError(503, 'Registration is currently unavailable');
    }

    const user = await createUserWithRole(input, DEFAULT_ROLE);
    return { user, token: signToken({ sub: user.id }) };
}

export async function login(email: string, password: string) {
    const user = await userRepository.findByEmailWithPassword(email);

    // Same message for "no such user" and "wrong password" so attackers can't discover registered emails
    if (!user || !(await user.comparePassword(password))) {
        throw new ApiError(401, 'Invalid email or password');
    }

    return { user, token: signToken({ sub: user.id }) };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
    const other = await userRepository.findOtherByEmailOrUsername(userId, input);
    if (other) {
        const field = input.email && other.email === input.email ? 'email' : 'username';
        throw new ApiError(409, `${field} already exists`);
    }

    const user = await userRepository.updateProfileById(userId, input);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
}

export async function setAvatar(userId: string, file: Buffer) {
    // A new upload takes the place of the previous picture in storage, so there is nothing to remove first
    const avatar = await uploadImage(file, 'avatar', userId);

    const user = await userRepository.setAvatarById(userId, avatar);
    if (!user) {
        // The account was deleted while the picture was uploading
        await deleteImage(avatar.publicId);
        throw new ApiError(404, 'User not found');
    }
    return user;
}

// Fine to call when there is no picture: the result is the same either way
export async function removeAvatar(userId: string, current: { publicId: string } | null) {
    const user = await userRepository.setAvatarById(userId, null);
    if (!user) throw new ApiError(404, 'User not found');

    if (current) await deleteImage(current.publicId);
    return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) throw new ApiError(404, 'User not found');

    // Knowing the current password proves it is the account's owner, not someone at an unlocked screen
    if (!(await user.comparePassword(currentPassword))) throw validationError('currentPassword', 'Current password is incorrect');

    // Saving (rather than an update query) runs the model hook that hashes the password
    user.password = newPassword;
    await user.save();
}
