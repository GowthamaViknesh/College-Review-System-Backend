import request from 'supertest';
import app from '../src/app';
import { ActionLog } from '../src/models/action-log.model';
import * as actionLogRepository from '../src/repositories/action-log.repository';
import { flushActionLogs, recordAction } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { createCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const comment = 'Good faculty and placements, but the hostel needs work.';

// Entries are written after the response is sent, so wait for them before looking
async function logs() {
    await flushActionLogs();
    return ActionLog.find().sort({ createdAt: 1, _id: 1 }).lean();
}

describe('what gets recorded', () => {
    it('records a successful change with who did it, what it was done to and the details', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');

        await request(app).patch(`/api/v1/users/${student.user.id}/role`).set('Authorization', admin.auth).send({ role: 'teacher' });

        const [entry] = await logs();
        expect(entry).toMatchObject({
            actor: { username: admin.user.username },
            action: 'role:assign',
            outcome: 'success',
            target: { type: 'user', id: student.user.id },
            details: { role: 'teacher' },
            method: 'PATCH',
            path: `/api/v1/users/${student.user.id}/role`,
            statusCode: 200,
        });
        expect(entry.actor.id!.toString()).toBe(admin.user.id);
        expect(entry.ip).toEqual(expect.any(String));
        expect(entry.createdAt).toBeInstanceOf(Date);
    });

    it('records the id of something that was just created', async () => {
        const admin = await createUser('admin');

        const res = await request(app)
            .post('/api/v1/roles')
            .set('Authorization', admin.auth)
            .send({ name: 'moderator', permissions: ['review:delete:any'] });

        const [entry] = await logs();
        expect(entry).toMatchObject({
            action: 'role:create',
            outcome: 'success',
            target: { type: 'role', id: res.body.data.role._id },
            details: { name: 'moderator', permissions: ['review:delete:any'] },
            statusCode: 201,
        });
    });

    it('records an attempt refused by a permission check', async () => {
        const student = await createUser('student');
        const victim = await createUser('student');

        await request(app).delete(`/api/v1/users/${victim.user.id}`).set('Authorization', student.auth);

        const [entry] = await logs();
        expect(entry).toMatchObject({
            actor: { username: student.user.username },
            action: 'user:delete',
            outcome: 'denied',
            target: { type: 'user', id: victim.user.id },
            details: { reason: 'You do not have permission to perform this action' },
            statusCode: 403,
        });
    });

    it('records an attempt refused by a business rule, with what was attempted', async () => {
        const teacher = await createUser('teacher');

        await request(app)
            .post('/api/v1/users')
            .set('Authorization', teacher.auth)
            .send({ username: 'sneaky', email: 'sneaky@example.com', password: 'password123', role: 'admin' });

        const [entry] = await logs();
        expect(entry).toMatchObject({
            actor: { username: teacher.user.username },
            action: 'user:create',
            outcome: 'denied',
            target: { type: 'user', id: null },
            details: { username: 'sneaky', role: 'admin', reason: 'You may only create users with the "student" role' },
        });
    });

    it('records an attempt to edit someone else’s review', async () => {
        const owner = await createUser('student');
        const other = await createUser('student');
        const college = await createCollege();
        const created = await request(app).post('/api/v1/reviews').set('Authorization', owner.auth).send({ college: college.id, rating: 2, comment });
        const reviewId = created.body.data.review._id;

        await request(app).patch(`/api/v1/reviews/${reviewId}`).set('Authorization', other.auth).send({ rating: 5 });

        const entries = await logs();
        expect(entries.map((e) => `${e.action} ${e.outcome}`)).toEqual(['review:create success', 'review:update denied']);
        expect(entries[1]).toMatchObject({ actor: { username: other.user.username }, target: { type: 'review', id: reviewId } });
    });

    it('records register and login against the account, and a failed login against the email tried', async () => {
        const credentials = { email: 'new@example.com', password: 'password123' };
        await request(app)
            .post('/api/v1/auth/register')
            .send({ username: 'newuser', ...credentials });
        await request(app).post('/api/v1/auth/login').send(credentials);
        await request(app)
            .post('/api/v1/auth/login')
            .send({ ...credentials, password: 'wrong-password' });

        const [registered, loggedIn, failed] = await logs();
        expect(registered).toMatchObject({ action: 'auth:register', outcome: 'success', actor: { username: 'newuser' }, statusCode: 201 });
        expect(loggedIn).toMatchObject({ action: 'auth:login', outcome: 'success', actor: { username: 'newuser' }, details: { email: 'new@example.com' } });
        expect(failed).toMatchObject({
            action: 'auth:login',
            outcome: 'failed',
            actor: { id: null, username: null },
            details: { email: 'new@example.com', reason: 'Invalid email or password' },
            statusCode: 401,
        });
    });

    it('never stores a password or a token', async () => {
        const admin = await createUser('admin');
        await request(app).post('/api/v1/auth/register').send({ username: 'newuser', email: 'new@example.com', password: 'super-secret-1' });
        await request(app).post('/api/v1/auth/login').send({ email: 'new@example.com', password: 'super-secret-1' });
        await request(app).post('/api/v1/auth/login').send({ email: 'new@example.com', password: 'super-secret-2' });
        await request(app).post('/api/v1/users').set('Authorization', admin.auth).send({ username: 'made', email: 'made@example.com', password: 'super-secret-3' });

        const stored = JSON.stringify(await logs());
        expect(stored).not.toContain('super-secret');
        expect(stored).not.toContain(admin.token);
        // No field named password or token anywhere (the word itself appears in "Invalid email or password")
        expect(stored).not.toMatch(/"(password|token)"\s*:/i);
    });

    it('does not record reads, validation errors, not-found or duplicate requests', async () => {
        const admin = await createUser('admin');
        const college = await createCollege({ name: 'Anna University' });

        await request(app).get('/api/v1/colleges');
        await request(app).get('/api/v1/users').set('Authorization', admin.auth);
        await request(app).post('/api/v1/colleges').set('Authorization', admin.auth).send({ name: 'A' }); // 400
        await request(app).delete('/api/v1/colleges/64b7f0000000000000000000').set('Authorization', admin.auth); // 404
        await request(app).post('/api/v1/colleges').set('Authorization', admin.auth).send({ name: 'anna university', city: 'Chennai', state: 'Tamil Nadu' }); // 409
        await request(app).delete(`/api/v1/colleges/${college.id}`); // 401, nobody identified

        expect(await logs()).toHaveLength(0);
    });

    it('keeps the username readable after the account is deleted', async () => {
        const admin = await createUser('admin');
        const teacher = await createUser('teacher', { username: 'mrs-priya' });
        await request(app).post('/api/v1/colleges').set('Authorization', teacher.auth).send({ name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu' });

        await request(app).delete(`/api/v1/users/${teacher.user.id}`).set('Authorization', admin.auth);

        const entries = await logs();
        expect(entries.map((e) => `${e.actor.username} ${e.action}`)).toEqual(['mrs-priya college:create', `${admin.user.username} user:delete`]);
    });

    it('covers every kind of change', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const asAdmin = (method: 'post' | 'patch' | 'delete', path: string) => request(app)[method](`/api/v1${path}`).set('Authorization', admin.auth);

        const college = (await asAdmin('post', '/colleges').send({ name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu' })).body.data.college;
        await asAdmin('patch', `/colleges/${college._id}`).send({ city: 'Madurai' });
        const review = (await request(app).post('/api/v1/reviews').set('Authorization', student.auth).send({ college: college._id, rating: 4, comment })).body.data.review;
        await request(app).patch(`/api/v1/reviews/${review._id}`).set('Authorization', student.auth).send({ rating: 5 });
        await asAdmin('delete', `/reviews/${review._id}`);
        await asAdmin('delete', `/colleges/${college._id}`);
        const role = (await asAdmin('post', '/roles').send({ name: 'moderator' })).body.data.role;
        await asAdmin('patch', `/roles/${role._id}`).send({ permissions: ['review:delete:any'] });
        await asAdmin('delete', `/roles/${role._id}`);
        const user = (await asAdmin('post', '/users').send({ username: 'made', email: 'made@example.com', password: 'password123' })).body.data.user;
        await asAdmin('patch', `/users/${user._id}/role`).send({ role: 'teacher' });
        await asAdmin('delete', `/users/${user._id}`);

        const entries = await logs();
        expect(entries.every((e) => e.outcome === 'success')).toBe(true);
        expect(entries.map((e) => e.action)).toEqual([
            'college:create',
            'college:update',
            'review:create',
            'review:update',
            'review:delete',
            'college:delete',
            'role:create',
            'role:update',
            'role:delete',
            'user:create',
            'role:assign',
            'user:delete',
        ]);
        expect(entries[1].details).toEqual({ changed: ['city'] });
        expect(entries[3].details).toEqual({ changed: ['rating'], rating: 5 });
        expect(entries[7].details).toEqual({ permissions: ['review:delete:any'] });
    });
});

describe('reliability', () => {
    it('does not fail the request when the log entry cannot be saved', async () => {
        const admin = await createUser('admin');
        const spy = jest.spyOn(actionLogRepository, 'create').mockRejectedValueOnce(new Error('database unavailable'));

        const res = await request(app).post('/api/v1/roles').set('Authorization', admin.auth).send({ name: 'moderator' });

        expect(res.status).toBe(201);
        await flushActionLogs();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('rejects an entry with an unknown action or outcome at the model level', async () => {
        const base = { actor: { id: null, username: null }, target: { type: 'user', id: null }, method: 'POST', path: '/x', statusCode: 200 };
        await expect(ActionLog.create({ ...base, action: 'made:up', outcome: 'success' })).rejects.toThrow(/not a valid enum value/);
        await expect(ActionLog.create({ ...base, action: 'user:create', outcome: 'maybe' })).rejects.toThrow(/not a valid enum value/);
    });

    it('expires entries automatically through a TTL index (90 days by default)', async () => {
        const indexes = await ActionLog.collection.indexes();
        const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);
        expect(ttl).toMatchObject({ key: { createdAt: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 });
    });
});

describe('GET /api/v1/action-logs', () => {
    const entry = (overrides: object) =>
        ActionLog.create({
            actor: { id: null, username: null },
            action: 'user:create',
            outcome: 'success',
            target: { type: 'user', id: null },
            method: 'POST',
            path: '/api/v1/users',
            statusCode: 201,
            ...overrides,
        });

    it('requires the log:read permission, which only admin has', async () => {
        expect((await request(app).get('/api/v1/action-logs')).status).toBe(401);
        for (const role of ['student', 'teacher']) {
            const { auth } = await createUser(role);
            expect((await request(app).get('/api/v1/action-logs').set('Authorization', auth)).status).toBe(403);
        }
        const admin = await createUser('admin');
        expect((await request(app).get('/api/v1/action-logs').set('Authorization', admin.auth)).status).toBe(200);
    });

    it('lists entries newest first with pagination', async () => {
        const admin = await createUser('admin');
        await entry({ action: 'role:create', createdAt: new Date('2026-01-01') });
        await entry({ action: 'role:update', createdAt: new Date('2026-01-02') });
        await entry({ action: 'role:delete', createdAt: new Date('2026-01-03') });

        const res = await request(app).get('/api/v1/action-logs?limit=2').set('Authorization', admin.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.logs.map((l: { action: string }) => l.action)).toEqual(['role:delete', 'role:update']);
        expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
        expect(res.body.data.logs[0]).not.toHaveProperty('__v');
    });

    it('filters by actor, action, outcome, target and date range', async () => {
        const admin = await createUser('admin');
        const someone = await createUser('student');
        const targetId = '64b7f0000000000000000001';
        await entry({ actor: { id: someone.user.id, username: 'someone' }, action: 'review:create', target: { type: 'review', id: targetId } });
        await entry({ action: 'user:delete', outcome: 'denied', statusCode: 403, createdAt: new Date('2026-03-10T12:00:00Z') });
        await entry({ action: 'auth:login', outcome: 'failed', statusCode: 401, createdAt: new Date('2026-03-20T12:00:00Z') });
        const actions = async (query: string) =>
            (await request(app).get(`/api/v1/action-logs?${query}`).set('Authorization', admin.auth)).body.data.logs.map((l: { action: string }) => l.action);

        expect(await actions(`actor=${someone.user.id}`)).toEqual(['review:create']);
        expect(await actions('action=user:delete')).toEqual(['user:delete']);
        expect(await actions('outcome=failed')).toEqual(['auth:login']);
        expect(await actions(`targetType=review&targetId=${targetId}`)).toEqual(['review:create']);
        expect(await actions('from=2026-03-01T00:00:00Z&to=2026-03-15T00:00:00Z')).toEqual(['user:delete']);
    });

    it('rejects invalid filters', async () => {
        const admin = await createUser('admin');
        const res = await request(app).get('/api/v1/action-logs?action=made:up&outcome=maybe&actor=nope&from=2026-03-10&to=2026-03-01').set('Authorization', admin.auth);
        expect(res.status).toBe(400);
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['action', 'actor', 'outcome', 'to']);
    });

    it('offers no way to change or remove an entry', async () => {
        const admin = await createUser('admin');
        const saved = await entry({});

        for (const method of ['post', 'put', 'patch', 'delete'] as const) {
            const collection = await request(app)[method]('/api/v1/action-logs').set('Authorization', admin.auth).send({});
            const single = await request(app)[method](`/api/v1/action-logs/${saved.id}`).set('Authorization', admin.auth).send({});
            expect([collection.status, single.status]).toEqual([404, 404]);
        }
        expect(await ActionLog.countDocuments()).toBe(1);
    });
});

describe('recordAction', () => {
    it('returns immediately and saves in the background', async () => {
        recordAction({
            actor: { id: null, username: null },
            action: 'auth:login',
            outcome: 'failed',
            target: { type: 'user', id: null },
            details: {},
            ip: null,
            method: 'POST',
            path: '/api/v1/auth/login',
            statusCode: 401,
        });

        await flushActionLogs();
        expect(await ActionLog.countDocuments()).toBe(1);
    });
});
