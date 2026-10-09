import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { Role } from '../src/models/role.model';
import { User } from '../src/models/user.model';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const validUser = { username: 'gowtham', email: 'gowtham@example.com', password: 'password123' };

describe('POST /api/v1/auth/register', () => {
    it('creates a student by default and returns a token without the password', async () => {
        const res = await request(app).post('/api/v1/auth/register').send(validUser);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toEqual(expect.any(String));
        expect(res.body.data.user).toMatchObject({ username: 'gowtham', email: 'gowtham@example.com', role: { name: 'student' } });
        expect(res.body.data.user).not.toHaveProperty('password');

        const saved = await User.findOne({ email: validUser.email }).select('+password');
        expect(saved?.password).not.toBe(validUser.password);
    });

    it.each(['admin', 'teacher', 'student'])('refuses to let the person registering choose a role (%s)', async (role) => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({ ...validUser, role });
        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toEqual({ field: 'role', message: 'A role cannot be chosen when registering' });
        expect(await User.countDocuments()).toBe(0);
    });

    it('is unavailable if an admin has removed the default role', async () => {
        await Role.deleteOne({ name: 'student' });
        const res = await request(app).post('/api/v1/auth/register').send(validUser);
        expect(res.status).toBe(503);
    });

    it('returns field-level errors for invalid input', async () => {
        const res = await request(app).post('/api/v1/auth/register').send({ username: 'ab', email: 'nope', password: '123' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Validation failed');
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['email', 'password', 'username']);
    });

    it('rejects a duplicate email with 409', async () => {
        await request(app).post('/api/v1/auth/register').send(validUser);
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({ ...validUser, username: 'someoneelse', email: 'GOWTHAM@example.com' });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('email already exists');
    });

    it('rejects a duplicate username with 409', async () => {
        await request(app).post('/api/v1/auth/register').send(validUser);
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({ ...validUser, email: 'other@example.com' });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('username already exists');
    });
});

describe('POST /api/v1/auth/login', () => {
    beforeEach(() => request(app).post('/api/v1/auth/register').send(validUser));

    it('logs in with correct credentials', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ email: validUser.email, password: validUser.password });
        expect(res.status).toBe(200);
        expect(res.body.data.token).toEqual(expect.any(String));
        expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('rejects a wrong password', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ email: validUser.email, password: 'wrongpassword' });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid email or password');
    });

    it('gives the same error for an unknown email', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid email or password');
    });

    it('rejects a missing password with 400', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ email: validUser.email });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/v1/auth/me', () => {
    it('returns the current user for a valid token', async () => {
        const { auth, user } = await createUser('teacher');
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
        expect(res.status).toBe(200);
        expect(res.body.data.user).toMatchObject({ email: user.email, role: { name: 'teacher' } });
        expect(res.body.data.user).not.toHaveProperty('password');
        expect(res.body.data.permissions).toEqual(['college:create', 'college:update', 'review:create', 'user:create']);
    });

    it('rejects a request with no token', async () => {
        const res = await request(app).get('/api/v1/auth/me');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Authentication required');
    });

    it('rejects a tampered token', async () => {
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.token');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid token');
    });

    it('rejects an expired token', async () => {
        const { user } = await createUser();
        const expired = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: -10 });
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Token expired');
    });

    it('rejects a token whose user was deleted', async () => {
        const { auth, user } = await createUser();
        await User.findByIdAndDelete(user.id);
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
        expect(res.status).toBe(401);
    });
});

describe('error handling', () => {
    it('returns JSON 404 for unknown routes', async () => {
        const res = await request(app).get('/api/v1/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 for malformed JSON', async () => {
        const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Malformed JSON body');
    });
});
