import { Role } from '../src/models/role.model';
import { User } from '../src/models/user.model';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

async function baseUser() {
    const role = await Role.findOne({ name: 'student' });
    return { username: 'gowtham', email: 'gowtham@example.com', password: 'secret123', role: role!._id };
}

describe('User model', () => {
    it('hashes the password and can verify it', async () => {
        const user = await User.create(await baseUser());
        expect(user.password).not.toBe('secret123');
        expect(await user.comparePassword('secret123')).toBe(true);
        expect(await user.comparePassword('wrong')).toBe(false);
    });

    it('does not re-hash the password when other fields change', async () => {
        const user = await User.create(await baseUser());
        const hash = user.password;
        user.username = 'renamed';
        await user.save();
        expect(user.password).toBe(hash);
    });

    it('never exposes the password in JSON', async () => {
        const user = await User.create(await baseUser());
        expect(user.toJSON()).not.toHaveProperty('password');
    });

    it('requires a role', async () => {
        const { role, ...withoutRole } = await baseUser();
        await expect(User.create(withoutRole)).rejects.toThrow(/Role is required/);
    });

    it('rejects a duplicate email', async () => {
        const base = await baseUser();
        await User.create(base);
        await expect(User.create({ ...base, username: 'other' })).rejects.toThrow(/duplicate key/);
    });
});
