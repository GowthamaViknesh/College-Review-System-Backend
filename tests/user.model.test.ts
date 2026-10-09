import { User } from '../src/models/user.model';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const base = { username: 'gowtham', email: 'Gowtham@Example.com', password: 'secret123' };

describe('User model', () => {
  it('hashes the password, lowercases email and defaults role to student', async () => {
    const user = await User.create(base);
    expect(user.password).not.toBe(base.password);
    expect(user.email).toBe('gowtham@example.com');
    expect(user.role).toBe('student');
    expect(await user.comparePassword('secret123')).toBe(true);
    expect(await user.comparePassword('wrong')).toBe(false);
  });

  it('never exposes password in JSON or default queries', async () => {
    const user = await User.create(base);
    expect(user.toJSON()).not.toHaveProperty('password');
    const found = await User.findById(user._id);
    expect(found?.password).toBeUndefined();
  });

  it('rejects an invalid role', async () => {
    await expect(User.create({ ...base, role: 'superuser' })).rejects.toThrow(/Role must be one of/);
  });

  it('rejects a duplicate email', async () => {
    await User.create(base);
    await expect(User.create({ ...base, username: 'other' })).rejects.toThrow(/duplicate key/);
  });
});
