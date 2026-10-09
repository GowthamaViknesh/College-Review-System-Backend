import request from 'supertest';
import app from '../src/app';
import { User } from '../src/models/user.model';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const UNKNOWN_ID = 'Unknown0Unknown0';

describe('access to /api/v1/users', () => {
    it('rejects unauthenticated requests with 401', async () => {
        const res = await request(app).get('/api/v1/users');
        expect(res.status).toBe(401);
    });

    it.each(['student', 'teacher'])('forbids a %s with 403', async (role) => {
        const { auth } = await createUser(role);
        const res = await request(app).get('/api/v1/users').set('Authorization', auth);
        expect(res.status).toBe(403);
    });

    it('applies a role change immediately, even to an already-issued token', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');

        await request(app).patch(`/api/v1/users/${student.user.userId}/role`).set('Authorization', admin.auth).send({ role: 'admin' });

        const res = await request(app).get('/api/v1/users').set('Authorization', student.auth);
        expect(res.status).toBe(200);
    });
});

describe('POST /api/v1/users', () => {
    const newUser = { username: 'newuser', email: 'New@Example.com', password: 'password123' };

    it('lets an admin create a user with any role', async () => {
        const admin = await createUser('admin');
        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', admin.auth)
            .send({ ...newUser, role: 'teacher' });

        expect(res.status).toBe(201);
        expect(res.body.data.user).toMatchObject({ username: 'newuser', email: 'new@example.com', role: { name: 'teacher' } });
        expect(res.body.data.user).not.toHaveProperty('password');
        expect(res.body.data).not.toHaveProperty('token');
    });

    it('lets the new user log in with the password they were given', async () => {
        const admin = await createUser('admin');
        await request(app).post('/api/v1/users').set('Authorization', admin.auth).send(newUser);

        const res = await request(app).post('/api/v1/auth/login').send({ email: 'new@example.com', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.data.user.role.name).toBe('student');
    });

    it('lets a teacher create students, but nothing more powerful', async () => {
        const teacher = await createUser('teacher');

        const asStudent = await request(app).post('/api/v1/users').set('Authorization', teacher.auth).send(newUser);
        expect(asStudent.status).toBe(201);
        expect(asStudent.body.data.user.role.name).toBe('student');

        for (const role of ['admin', 'teacher']) {
            const res = await request(app)
                .post('/api/v1/users')
                .set('Authorization', teacher.auth)
                .send({ username: 'sneaky', email: 'sneaky@example.com', password: 'password123', role });
            expect(res.status).toBe(403);
        }
        expect(await User.findOne({ username: 'sneaky' })).toBeNull();
    });

    it('forbids a student and rejects a request with no token', async () => {
        const student = await createUser('student');
        expect((await request(app).post('/api/v1/users').set('Authorization', student.auth).send(newUser)).status).toBe(403);
        expect((await request(app).post('/api/v1/users').send(newUser)).status).toBe(401);
    });

    it('rejects an unknown role, invalid fields and duplicates', async () => {
        const admin = await createUser('admin');
        const post = (body: object) => request(app).post('/api/v1/users').set('Authorization', admin.auth).send(body);

        const unknownRole = await post({ ...newUser, role: 'superuser' });
        expect(unknownRole.status).toBe(400);
        expect(unknownRole.body.errors[0].field).toBe('role');

        const invalid = await post({ username: 'ab', email: 'nope', password: '123' });
        expect(invalid.status).toBe(400);
        expect(invalid.body.errors).toHaveLength(3);

        expect((await post(newUser)).status).toBe(201);
        const duplicate = await post({ ...newUser, username: 'different' });
        expect(duplicate.status).toBe(409);
        expect(duplicate.body.message).toBe('email already exists');
    });
});

describe('GET /api/v1/users', () => {
    it('lists users with pagination metadata, role names and no passwords', async () => {
        const admin = await createUser('admin');
        await createUser('student');
        await createUser('teacher');

        const res = await request(app).get('/api/v1/users?limit=2').set('Authorization', admin.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.users).toHaveLength(2);
        expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
        expect(res.body.data.users[0]).not.toHaveProperty('password');
        expect(res.body.data.users[0].role).toEqual({ roleId: expect.any(String), name: expect.any(String) });
    });

    it('returns the second page without repeating users', async () => {
        const admin = await createUser('admin');
        await createUser('student');
        await createUser('teacher');

        const first = await request(app).get('/api/v1/users?limit=2&page=1').set('Authorization', admin.auth);
        const second = await request(app).get('/api/v1/users?limit=2&page=2').set('Authorization', admin.auth);

        const ids = [...first.body.data.users, ...second.body.data.users].map((u: { userId: string }) => u.userId);
        expect(second.body.data.users).toHaveLength(1);
        expect(new Set(ids).size).toBe(3);
    });

    it('filters by role name and searches by username or email', async () => {
        const admin = await createUser('admin');
        await createUser('teacher', { username: 'priya', email: 'priya@college.edu' });
        await createUser('student', { username: 'arun', email: 'arun@college.edu' });

        const byRole = await request(app).get('/api/v1/users?role=teacher').set('Authorization', admin.auth);
        expect(byRole.body.data.users.map((u: { username: string }) => u.username)).toEqual(['priya']);

        const bySearch = await request(app).get('/api/v1/users?search=ARUN').set('Authorization', admin.auth);
        expect(bySearch.body.data.users.map((u: { username: string }) => u.username)).toEqual(['arun']);
    });

    it('treats regex characters in search as plain text', async () => {
        const admin = await createUser('admin');
        const res = await request(app).get('/api/v1/users?search=.*').set('Authorization', admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.data.users).toHaveLength(0);
    });

    it('rejects an out-of-range limit and an unknown role with 400', async () => {
        const admin = await createUser('admin');

        const badLimit = await request(app).get('/api/v1/users?limit=1000').set('Authorization', admin.auth);
        expect(badLimit.status).toBe(400);
        expect(badLimit.body.errors[0].field).toBe('limit');

        const badRole = await request(app).get('/api/v1/users?role=superuser').set('Authorization', admin.auth);
        expect(badRole.status).toBe(400);
        expect(badRole.body.errors[0].field).toBe('role');
    });
});

describe('GET /api/v1/users/:id', () => {
    it('returns a single user', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const res = await request(app).get(`/api/v1/users/${student.user.userId}`).set('Authorization', admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.data.user.email).toBe(student.user.email);
        expect(res.body.data.user.role.name).toBe('student');
    });

    it('returns 400 for a malformed id and 404 for an unknown id', async () => {
        const admin = await createUser('admin');
        const bad = await request(app).get('/api/v1/users/not-an-id').set('Authorization', admin.auth);
        expect(bad.status).toBe(400);
        const missing = await request(app).get(`/api/v1/users/${UNKNOWN_ID}`).set('Authorization', admin.auth);
        expect(missing.status).toBe(404);
    });
});

describe('PATCH /api/v1/users/:id/role', () => {
    it('lets an admin change a user role', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');

        const res = await request(app).patch(`/api/v1/users/${student.user.userId}/role`).set('Authorization', admin.auth).send({ role: 'teacher' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.role.name).toBe('teacher');
    });

    it('rejects a role that does not exist', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const res = await request(app).patch(`/api/v1/users/${student.user.userId}/role`).set('Authorization', admin.auth).send({ role: 'superuser' });
        expect(res.status).toBe(400);
        expect(res.body.errors[0].field).toBe('role');
    });

    it('stops an admin changing their own role', async () => {
        const admin = await createUser('admin');
        const res = await request(app).patch(`/api/v1/users/${admin.user.userId}/role`).set('Authorization', admin.auth).send({ role: 'student' });
        expect(res.status).toBe(400);
        expect((await User.findById(admin.user.id))?.role.toString()).toBe(admin.user.role.toString());
    });

    it('forbids a teacher from changing roles', async () => {
        const teacher = await createUser('teacher');
        const student = await createUser('student');
        const res = await request(app).patch(`/api/v1/users/${student.user.userId}/role`).set('Authorization', teacher.auth).send({ role: 'admin' });
        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/v1/users/:id', () => {
    it('lets an admin delete a user', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const res = await request(app).delete(`/api/v1/users/${student.user.userId}`).set('Authorization', admin.auth);
        expect(res.status).toBe(204);
        expect(await User.findById(student.user.id)).toBeNull();
    });

    it('stops an admin deleting their own account', async () => {
        const admin = await createUser('admin');
        const res = await request(app).delete(`/api/v1/users/${admin.user.userId}`).set('Authorization', admin.auth);
        expect(res.status).toBe(400);
    });

    it('returns 404 when the user does not exist', async () => {
        const admin = await createUser('admin');
        const res = await request(app).delete(`/api/v1/users/${UNKNOWN_ID}`).set('Authorization', admin.auth);
        expect(res.status).toBe(404);
    });
});
