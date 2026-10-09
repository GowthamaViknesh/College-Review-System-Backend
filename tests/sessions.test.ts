import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { ActionLog } from '../src/models/action-log.model';
import { RefreshToken } from '../src/models/refresh-token.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { createHomeCollege, inCollege } from './helpers/college';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
beforeEach(async () => {
    await createHomeCollege();
});
afterEach(clearTestDb);
afterAll(closeTestDb);

const login = (email: string, password = 'password123') => request(app).post('/api/v1/auth/login').send({ email, password });
const refresh = (refreshToken: unknown) => request(app).post('/api/v1/auth/refresh').send({ refreshToken });
const logout = (refreshToken: unknown) => request(app).post('/api/v1/auth/logout').send({ refreshToken });
const me = (token: string) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

// Moves "when this token was exchanged" into the past, as if time had gone by since
const ageUse = (seconds: number) => RefreshToken.updateMany({ usedAt: { $ne: null } }, { usedAt: new Date(Date.now() - seconds * 1000) });

async function loggedIn(role = 'student') {
    const { user } = await createUser(role);
    const res = await login(user.email);
    return { user, token: res.body.data.token as string, refreshToken: res.body.data.refreshToken as string };
}

describe('logging in and registering', () => {
    it('return an access token and a refresh token', async () => {
        const { user } = await createUser('student');
        const res = await login(user.email);
        const registered = await request(app)
            .post('/api/v1/auth/register')
            .send(inCollege({ username: 'newcomer', email: 'newcomer@example.com', password: 'password123' }));

        for (const body of [res.body, registered.body]) {
            expect(body.data.token.split('.')).toHaveLength(3);
            expect(body.data.refreshToken).toMatch(/^[\w-]{43}$/);
        }
        expect((await me(registered.body.data.token)).status).toBe(200);
    });

    it('store only a hash of the refresh token', async () => {
        const session = await loggedIn();
        const [stored] = await RefreshToken.find().lean();

        expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
        expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(String(stored.user)).toBe(session.user.id);
    });

    it('give each login its own refresh token, valid for the configured number of days', async () => {
        const { user } = await createUser('student');
        const first = await login(user.email);
        const second = await login(user.email);
        const stored = await RefreshToken.find().lean();

        expect(first.body.data.refreshToken).not.toBe(second.body.data.refreshToken);
        expect(new Set(stored.map((t) => t.family)).size).toBe(2);
        const days = (stored[0].expiresAt.getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThanOrEqual(7);
    });
});

describe('POST /api/v1/auth/refresh', () => {
    it('exchanges a refresh token for a new working pair', async () => {
        const session = await loggedIn();
        const res = await refresh(session.refreshToken);

        expect(res.status).toBe(200);
        expect(Object.keys(res.body.data).sort()).toEqual(['refreshToken', 'token']);
        expect(res.body.data.refreshToken).not.toBe(session.refreshToken);
        expect((await me(res.body.data.token)).body.data.user.userId).toBe(session.user.userId);
    });

    it('needs no access token, so it works after the access token has expired', async () => {
        const session = await loggedIn();
        const expired = jwt.sign({ sub: session.user.userId }, process.env.JWT_SECRET!, { expiresIn: -10 });
        expect((await me(expired)).status).toBe(401);

        const res = await refresh(session.refreshToken);
        expect(res.status).toBe(200);
        expect((await me(res.body.data.token)).status).toBe(200);
    });

    it('can be repeated: each new refresh token works in turn', async () => {
        let { refreshToken } = await loggedIn();
        for (let i = 0; i < 3; i += 1) {
            await ageUse(60);
            const res = await refresh(refreshToken);
            expect(res.status).toBe(200);
            refreshToken = res.body.data.refreshToken;
        }
    });

    it('ends the whole login when an already exchanged token is used again later', async () => {
        const session = await loggedIn();
        const next = await refresh(session.refreshToken);
        await ageUse(60);

        // Someone still has the old token: the thief, or the real client after the thief used it first
        const replay = await refresh(session.refreshToken);
        expect(replay.status).toBe(401);
        expect(replay.body.message).toBe('Your session has ended. Please log in again.');

        // The newer token dies with it, so whoever holds it is logged out too
        expect((await refresh(next.body.data.refreshToken)).status).toBe(401);
        expect(await RefreshToken.countDocuments()).toBe(0);
    });

    it('does not end other logins of the same person', async () => {
        const { user } = await createUser('student');
        const phone = (await login(user.email)).body.data.refreshToken;
        const laptop = (await login(user.email)).body.data.refreshToken;

        await refresh(phone);
        await ageUse(60);
        expect((await refresh(phone)).status).toBe(401);

        expect((await refresh(laptop)).status).toBe(200);
    });

    it('accepts the same token twice within a few seconds, as two tabs or a retry would send it', async () => {
        const session = await loggedIn();
        const [first, second] = await Promise.all([refresh(session.refreshToken), refresh(session.refreshToken)]);

        expect([first.status, second.status]).toEqual([200, 200]);
        expect(first.body.data.refreshToken).not.toBe(second.body.data.refreshToken);
        // Both tabs carry on: each received token can be exchanged again
        await ageUse(60);
        expect((await refresh(second.body.data.refreshToken)).status).toBe(200);
    });

    it('refuses an expired refresh token', async () => {
        const session = await loggedIn();
        await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

        expect((await refresh(session.refreshToken)).status).toBe(401);
    });

    it('refuses a token it never issued, with the same answer as any other refusal', async () => {
        const res = await refresh('x'.repeat(43));
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ success: false, message: 'Your session has ended. Please log in again.' });
    });

    it('refuses an access token offered as a refresh token', async () => {
        const session = await loggedIn();
        expect((await refresh(session.token)).status).toBe(401);
    });

    it('validates the body', async () => {
        expect((await refresh(undefined)).status).toBe(400);
        expect((await refresh(12345)).status).toBe(400);
        expect((await refresh('x'.repeat(201))).status).toBe(400);
    });

    it('refuses once the account has been deleted', async () => {
        const admin = await createUser('admin');
        const session = await loggedIn();
        await request(app).delete(`/api/v1/users/${session.user.userId}`).set('Authorization', admin.auth);

        expect((await refresh(session.refreshToken)).status).toBe(401);
        expect(await RefreshToken.countDocuments({ user: session.user.id })).toBe(0);
    });

    it('picks up a role change: the new access token carries no stale permissions', async () => {
        const admin = await createUser('admin');
        const session = await loggedIn('student');
        await request(app).patch(`/api/v1/users/${session.user.userId}/role`).set('Authorization', admin.auth).send({ role: 'teacher' });

        const res = await refresh(session.refreshToken);
        expect((await me(res.body.data.token)).body.data.permissions).toContain('college:create');
    });
});

describe('POST /api/v1/auth/logout', () => {
    it('ends the login, so its refresh token can no longer be exchanged', async () => {
        const session = await loggedIn();
        const res = await logout(session.refreshToken);

        expect(res.status).toBe(204);
        expect((await refresh(session.refreshToken)).status).toBe(401);
    });

    it('also ends tokens the login was refreshed into', async () => {
        const session = await loggedIn();
        const next = await refresh(session.refreshToken);

        // Logging out with the older token of the pair still ends the login
        await logout(session.refreshToken);
        expect((await refresh(next.body.data.refreshToken)).status).toBe(401);
    });

    it('leaves the same person logged in on their other devices', async () => {
        const { user } = await createUser('student');
        const phone = (await login(user.email)).body.data.refreshToken;
        const laptop = (await login(user.email)).body.data.refreshToken;

        await logout(phone);
        expect((await refresh(laptop)).status).toBe(200);
    });

    it('succeeds for an unknown token or a second call, and validates the body', async () => {
        const session = await loggedIn();
        expect((await logout(session.refreshToken)).status).toBe(204);
        expect((await logout(session.refreshToken)).status).toBe(204);
        expect((await logout('never-issued')).status).toBe(204);
        expect((await logout(undefined)).status).toBe(400);
    });
});

describe('logging out and the action log', () => {
    it('records who logged out', async () => {
        const session = await loggedIn();
        await logout(session.refreshToken);
        await flushActionLogs();

        const entries = await ActionLog.find({ action: 'auth:logout' }).lean();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ outcome: 'success', statusCode: 204, actor: { username: session.user.username }, target: { type: 'user', id: session.user.userId } });
        expect(JSON.stringify(entries[0])).not.toContain(session.refreshToken);
    });

    it('records nothing when there was no login to end', async () => {
        const session = await loggedIn();
        await logout(session.refreshToken);
        await logout(session.refreshToken);
        await logout('never-issued');
        await flushActionLogs();

        expect(await ActionLog.countDocuments({ action: 'auth:logout' })).toBe(1);
    });
});

describe('changing the password', () => {
    const change = (token: string) =>
        request(app).patch('/api/v1/auth/me/password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'password123', newPassword: 'brand-new-password' });

    it('returns a new pair of tokens that work', async () => {
        const session = await loggedIn();
        const res = await change(session.token);

        expect(res.status).toBe(200);
        expect((await me(res.body.data.token)).status).toBe(200);
        expect((await refresh(res.body.data.refreshToken)).status).toBe(200);
    });

    it('ends every other login: their refresh tokens stop working', async () => {
        const { user } = await createUser('student');
        const phone = (await login(user.email)).body.data;
        const laptop = (await login(user.email)).body.data;

        await change(laptop.token);

        expect((await refresh(phone.refreshToken)).status).toBe(401);
        expect((await refresh(laptop.refreshToken)).status).toBe(401);
        expect(await RefreshToken.countDocuments({ user: user.id })).toBe(1);
    });

    it('refuses access tokens issued before the change, without waiting for them to expire', async () => {
        const session = await loggedIn();
        // An access token from a minute ago, still far from expiring
        const older = jwt.sign({ sub: session.user.userId, iat: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET!, { expiresIn: '1h' });
        expect((await me(older)).status).toBe(200);

        const changed = await change(session.token);

        const res = await me(older);
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Your password was changed. Please log in again.');
        expect((await me(changed.body.data.token)).status).toBe(200);
    });

    it('does not show when the password was changed in API responses', async () => {
        const session = await loggedIn();
        const changed = await change(session.token);
        const res = await me(changed.body.data.token);

        expect(res.body.data.user).not.toHaveProperty('passwordChangedAt');
    });
});
