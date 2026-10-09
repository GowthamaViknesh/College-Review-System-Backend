import * as roleRepository from '../repositories/role.repository';
import * as userRepository from '../repositories/user.repository';
import { createUserWithRole } from './user.service';
import { DEFAULT_ROLE } from '../common/constants/roles';
import { ApiError, signToken } from '../common/utils/utils';
import { RegisterInput } from '../common/interfaces/user.interface';

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
