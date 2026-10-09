import { signToken } from '../../src/common/utils/utils';
import { Role } from '../../src/models/role.model';
import { User } from '../../src/models/user.model';

let counter = 0;

// Creates a user with the named role directly in the DB (the only way to get an admin)
// and returns it with a valid token
export async function createUser(roleName = 'student', overrides: Record<string, string> = {}) {
    const role = await Role.findOne({ name: roleName });
    if (!role) throw new Error(`Test setup: role "${roleName}" does not exist`);

    counter += 1;
    const user = await User.create({
        username: `${roleName}${counter}`,
        email: `${roleName}${counter}@example.com`,
        password: 'password123',
        role: role._id,
        ...overrides,
    });
    const token = signToken({ sub: user.userId });
    return { user, token, auth: `Bearer ${token}` };
}
