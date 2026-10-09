import request from 'supertest';
import app from '../src/app';
import { ActionLog } from '../src/models/action-log.model';
import { User } from '../src/models/user.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { createCollege, rateCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

describe('PATCH /api/v1/auth/me', () => {
    it('lets any logged-in user change their own username and email', async () => {
        for (const role of ['student', 'teacher', 'admin']) {
            const me = await createUser(role);
            const res = await request(app)
                .patch('/api/v1/auth/me')
                .set('Authorization', me.auth)
                .send({ username: `new-${role}`, email: `New-${role}@Example.com` });

            expect(res.status).toBe(200);
            expect(res.body.data.user).toMatchObject({ username: `new-${role}`, email: `new-${role}@example.com`, role: { name: role } });
            expect(res.body.data.user).not.toHaveProperty('password');
        }
    });

    it('changes only the fields that were sent', async () => {
        const me = await createUser('student');
        const res = await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({ username: 'renamed' });

        expect(res.body.data.user).toMatchObject({ username: 'renamed', email: me.user.email });
    });

    it('keeps the same token working after the change', async () => {
        const me = await createUser('student');
        await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({ username: 'renamed' });

        const res = await request(app).get('/api/v1/auth/me').set('Authorization', me.auth);
        expect(res.status).toBe(200);
        expect(res.body.data.user.username).toBe('renamed');
    });

    it('cannot be used to change your own role or password', async () => {
        const me = await createUser('student');
        const before = await User.findById(me.user.id).select('+password');

        const res = await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({ username: 'renamed', role: 'admin', password: 'hacked-password' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.role.name).toBe('student');
        const after = await User.findById(me.user.id).select('+password');
        expect(after!.role.toString()).toBe(before!.role.toString());
        expect(after!.password).toBe(before!.password);
    });

    it('rejects an email or username that someone else has, but allows keeping your own', async () => {
        const me = await createUser('student');
        const other = await createUser('student');
        const patch = (body: object) => request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send(body);

        const takenEmail = await patch({ email: other.user.email });
        expect(takenEmail.status).toBe(409);
        expect(takenEmail.body.message).toBe('email already exists');

        const takenName = await patch({ username: other.user.username });
        expect(takenName.status).toBe(409);
        expect(takenName.body.message).toBe('username already exists');

        expect((await patch({ username: me.user.username, email: me.user.email })).status).toBe(200);
    });

    it('rejects invalid values, an empty body and a missing token', async () => {
        const me = await createUser('student');

        const invalid = await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({ username: 'ab', email: 'nope' });
        expect(invalid.status).toBe(400);
        expect(invalid.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['email', 'username']);

        expect((await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({})).status).toBe(400);
        expect((await request(app).patch('/api/v1/auth/me').send({ username: 'renamed' })).status).toBe(401);
    });

    it('is recorded in the action log', async () => {
        const me = await createUser('student');
        await request(app).patch('/api/v1/auth/me').set('Authorization', me.auth).send({ username: 'renamed' });

        await flushActionLogs();
        const entry = await ActionLog.findOne({ action: 'profile:update' }).lean();
        expect(entry).toMatchObject({ outcome: 'success', target: { type: 'user', id: me.user.id }, details: { changed: ['username'] } });
    });
});

describe('PATCH /api/v1/auth/me/password', () => {
    const change = (auth: string, body: object) => request(app).patch('/api/v1/auth/me/password').set('Authorization', auth).send(body);
    const login = (email: string, password: string) => request(app).post('/api/v1/auth/login').send({ email, password });

    it('changes the password: the new one logs in, the old one does not', async () => {
        const me = await createUser('student');

        const res = await change(me.auth, { currentPassword: 'password123', newPassword: 'brand-new-password' });

        expect(res.status).toBe(200);
        expect((await login(me.user.email, 'brand-new-password')).status).toBe(200);
        expect((await login(me.user.email, 'password123')).status).toBe(401);
    });

    it('stores the new password hashed', async () => {
        const me = await createUser('student');
        await change(me.auth, { currentPassword: 'password123', newPassword: 'brand-new-password' });

        const saved = await User.findById(me.user.id).select('+password');
        expect(saved!.password).not.toBe('brand-new-password');
        expect(await saved!.comparePassword('brand-new-password')).toBe(true);
    });

    it('refuses when the current password is wrong', async () => {
        const me = await createUser('student');

        const res = await change(me.auth, { currentPassword: 'not-my-password', newPassword: 'brand-new-password' });

        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toEqual({ field: 'currentPassword', message: 'Current password is incorrect' });
        expect((await login(me.user.email, 'password123')).status).toBe(200);
    });

    it('rejects a new password that is too short, the same as the old one, or missing', async () => {
        const me = await createUser('student');

        expect((await change(me.auth, { currentPassword: 'password123', newPassword: 'short' })).status).toBe(400);
        expect((await change(me.auth, { currentPassword: 'password123' })).status).toBe(400);

        const same = await change(me.auth, { currentPassword: 'password123', newPassword: 'password123' });
        expect(same.status).toBe(400);
        expect(same.body.errors[0].message).toContain('must be different');
    });

    it('requires a token', async () => {
        const res = await request(app).patch('/api/v1/auth/me/password').send({ currentPassword: 'password123', newPassword: 'brand-new-password' });
        expect(res.status).toBe(401);
    });

    it('is recorded in the action log without either password', async () => {
        const me = await createUser('student');
        await change(me.auth, { currentPassword: 'password123', newPassword: 'brand-new-password' });

        await flushActionLogs();
        const entries = await ActionLog.find({ action: 'auth:password_change' }).lean();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ outcome: 'success', actor: { username: me.user.username } });
        expect(JSON.stringify(entries)).not.toMatch(/password123|brand-new-password/);
    });
});

describe('GET /api/v1/colleges sort direction', () => {
    const names = async (query: string) => (await request(app).get(`/api/v1/colleges?${query}`)).body.data.colleges.map((c: { name: string }) => c.name);

    it('reverses the name order with order=desc', async () => {
        for (const name of ['Beta', 'Alpha', 'Gamma']) await createCollege({ name });

        expect(await names('sort=name')).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(await names('sort=name&order=asc')).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(await names('sort=name&order=desc')).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('orders by rating both ways, keeping unrated colleges last in each', async () => {
        const good = await createCollege({ name: 'Good' });
        const poor = await createCollege({ name: 'Poor' });
        await createCollege({ name: 'Unrated' });
        await rateCollege(good.id, [5]);
        await rateCollege(poor.id, [2]);

        expect(await names('sort=rating')).toEqual(['Good', 'Poor', 'Unrated']);
        expect(await names('sort=rating&order=desc')).toEqual(['Good', 'Poor', 'Unrated']);
        expect(await names('sort=rating&order=asc')).toEqual(['Poor', 'Good', 'Unrated']);
    });

    it('orders by number of reviews and by date both ways', async () => {
        const first = await createCollege({ name: 'First' });
        const second = await createCollege({ name: 'Second' });
        await rateCollege(first.id, [4, 4, 4]);
        await rateCollege(second.id, [4]);

        expect(await names('sort=reviews')).toEqual(['First', 'Second']);
        expect(await names('sort=reviews&order=asc')).toEqual(['Second', 'First']);
        expect(await names('sort=newest')).toEqual(['Second', 'First']);
        expect(await names('sort=newest&order=asc')).toEqual(['First', 'Second']);
    });

    it('does not leak the helper field and rejects an unknown direction', async () => {
        await createCollege();
        const res = await request(app).get('/api/v1/colleges?sort=rating');
        expect(res.body.data.colleges[0]).not.toHaveProperty('unrated');

        const bad = await request(app).get('/api/v1/colleges?order=sideways');
        expect(bad.status).toBe(400);
        expect(bad.body.errors[0].field).toBe('order');
    });
});
