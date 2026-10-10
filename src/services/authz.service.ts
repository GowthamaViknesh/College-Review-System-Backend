import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';

import { registerUser } from './user.service';
import { endAllSessions, startSession } from './session.service';

import { DEFAULT_ROLE } from '../common/constants/roles';
import { ApiError, validationError } from '../common/utils/utils';
import { deleteImage, uploadImage } from '../common/utils/image-storage';
import { RegisterInput, UpdateProfileInput } from '../common/interfaces/user.interface';

export async function register(input: RegisterInput) {
    if (!(await roleRepository.findByName(DEFAULT_ROLE))) {
        throw new ApiError(503, 'Registration is currently unavailable');
    }

    const user = await registerUser(input);
    return { user, ...(await startSession(user)) };
}

export async function login(email: string, password: string) {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user || !(await user.comparePassword(password))) {
        throw new ApiError(401, 'Invalid email or password');
    }

    return { user, ...(await startSession(user)) };
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

export async function setAvatar(me: { id: string; userId: string; avatar: { publicId: string } | null }, file: Buffer) {
    const avatar = await uploadImage(file, 'avatar', me.userId);

    const user = await userRepository.setAvatarById(me.id, avatar);
    if (!user) {
        await deleteImage(avatar.publicId);
        throw new ApiError(404, 'User not found');
    }
    if (me.avatar && me.avatar.publicId !== avatar.publicId) await deleteImage(me.avatar.publicId);
    return user;
}

export async function removeAvatar(userId: string, current: { publicId: string } | null) {
    const user = await userRepository.setAvatarById(userId, null);
    if (!user) throw new ApiError(404, 'User not found');

    if (current) await deleteImage(current.publicId);
    return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) throw new ApiError(404, 'User not found');

    if (!(await user.comparePassword(currentPassword))) throw validationError('currentPassword', 'Current password is incorrect');

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    await endAllSessions(userId);
    return startSession(user);
}
