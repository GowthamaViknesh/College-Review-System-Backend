import request from 'supertest';
import app from '../src/app';
import * as mailer from '../src/common/utils/mailer';
import { ActionLog } from '../src/models/action-log.model';
import { PasswordReset } from '../src/models/password-reset.model';
import { RefreshToken } from '../src/models/refresh-token.model';
import { User } from '../src/models/user.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

// No email leaves the machine: the sender is replaced, and the tests read the code from what it was asked to send
jest.mock('../src/common/utils/mailer', () => ({
    isMailConfigured: jest.fn(() => true),
    sendPasswordResetEmail: jest.fn(async () => undefined),
}));
const sendEmail = jest.mocked(mailer.sendPasswordResetEmail);

beforeAll(connectTestDb);
afterEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();
});
afterAll(closeTestDb);

const forgot = (email: unknown) => request(app).post('/api/v1/auth/forgot-password').send({ email });
const verify = (email: string, code: string) => request(app).post('/api/v1/auth/verify-reset-code').send({ email, code });
const setPassword = (resetToken: unknown, newPassword: unknown = 'brand-new-password') => request(app).post('/api/v1/auth/reset-password').send({ resetToken, newPassword });
// Both steps, the way the screens do them: enter the code, then choose the password.
// If the code is refused, that refusal is the result.
async function reset(email: string, code: string, newPassword: unknown = 'brand-new-password') {
    const checked = await verify(email, code);
    return checked.status === 200 ? setPassword(checked.body.data.resetToken, newPassword) : checked;
}
const login = (email: string, password: string) => request(app).post('/api/v1/auth/login').send({ email, password });

const INVALID = 'That code is wrong or has expired. Check it, or ask for a new one.';
const codeError = (res: request.Response) => res.body.errors?.find((e: { field: string }) => e.field === 'code')?.message;

// Asks for a code and returns the one that was "emailed"
async function requestCode(email: string) {
    await forgot(email);
    return sendEmail.mock.calls.at(-1)![0].code;
}

// A code that is certainly not the right one
const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

// Lets the next request through the one-per-minute limit, as if a minute had passed
const allowResend = () => PasswordReset.updateMany({}, { sentAt: new Date(Date.now() - 61_000) });

describe('POST /api/v1/auth/forgot-password', () => {
    it('emails a 6-digit code to the account', async () => {
        const { user } = await createUser('student');
        const res = await forgot(user.email);

        expect(res.status).toBe(200);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail.mock.calls[0][0]).toEqual({ to: user.email, name: user.username, code: expect.stringMatching(/^\d{6}$/), minutes: 10 });
    });

    it('gives the same answer for an address with no account, and sends nothing', async () => {
        const { user } = await createUser('student');
        const known = await forgot(user.email);
        const unknown = await forgot('nobody@example.com');

        expect(unknown.status).toBe(200);
        expect(unknown.body).toEqual(known.body);
        expect(unknown.body.data.message).toBe('If an account exists for that email, a reset code has been sent to it.');
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(await PasswordReset.countDocuments()).toBe(1);
    });

    it('finds the account whatever the capitals in the address', async () => {
        const { user } = await createUser('student');
        await forgot(user.email.toUpperCase());
        expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('stores a hash of the code, never the code, with a 10 minute life', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        const [stored] = await PasswordReset.find().lean();

        expect(JSON.stringify(stored)).not.toContain(code);
        expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.attempts).toBe(0);
        const minutes = (stored.expiresAt.getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(9.9);
        expect(minutes).toBeLessThanOrEqual(10);
    });

    it('sends at most one email a minute per account, without saying so', async () => {
        const { user } = await createUser('student');
        const first = await requestCode(user.email);
        const again = await forgot(user.email);

        expect(again.status).toBe(200);
        expect(sendEmail).toHaveBeenCalledTimes(1);
        // The code already sent still works
        expect((await reset(user.email, first)).status).toBe(204);
    });

    it('replaces the previous code when a new one is sent', async () => {
        const { user } = await createUser('student');
        const first = await requestCode(user.email);
        await allowResend();
        const second = await requestCode(user.email);

        expect(sendEmail).toHaveBeenCalledTimes(2);
        expect(await PasswordReset.countDocuments()).toBe(1);
        if (first !== second) expect((await reset(user.email, first)).status).toBe(400);
        expect((await reset(user.email, second)).status).toBe(204);
    });

    it('still answers normally if the email cannot be sent', async () => {
        const { user } = await createUser('student');
        sendEmail.mockRejectedValueOnce(new Error('connection timed out'));

        expect((await forgot(user.email)).status).toBe(200);
    });

    it('validates the email', async () => {
        expect((await forgot('not-an-email')).status).toBe(400);
        expect((await forgot(undefined)).status).toBe(400);
        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe('POST /api/v1/auth/reset-password', () => {
    it('sets the new password: it logs in, the old one does not', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);

        const res = await reset(user.email, code);

        expect(res.status).toBe(204);
        expect((await login(user.email, 'brand-new-password')).status).toBe(200);
        expect((await login(user.email, 'password123')).status).toBe(401);
    });

    it('stores the new password hashed', async () => {
        const { user } = await createUser('student');
        await reset(user.email, await requestCode(user.email));

        const saved = await User.findById(user.id).select('+password');
        expect(saved!.password).not.toBe('brand-new-password');
        expect(await saved!.comparePassword('brand-new-password')).toBe(true);
    });

    it('works once', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        await reset(user.email, code);

        const second = await reset(user.email, code, 'another-new-password');
        expect(second.status).toBe(400);
        expect(codeError(second)).toBe(INVALID);
        expect((await login(user.email, 'brand-new-password')).status).toBe(200);
    });

    it('refuses a wrong code and leaves the password alone', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);

        const res = await reset(user.email, wrong(code));

        expect(res.status).toBe(400);
        expect(codeError(res)).toBe(INVALID);
        expect((await login(user.email, 'password123')).status).toBe(200);
    });

    it('stops accepting anything after 5 tries, even the right code', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);

        for (let i = 0; i < 5; i += 1) expect((await reset(user.email, wrong(code))).status).toBe(400);

        const res = await reset(user.email, code);
        expect(res.status).toBe(400);
        expect(codeError(res)).toBe(INVALID);
        expect((await login(user.email, 'password123')).status).toBe(200);
    });

    it('allows the right code on the fifth try', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        for (let i = 0; i < 4; i += 1) await reset(user.email, wrong(code));

        expect((await reset(user.email, code)).status).toBe(204);
    });

    it('gives a fresh set of tries with a new code', async () => {
        const { user } = await createUser('student');
        const first = await requestCode(user.email);
        for (let i = 0; i < 5; i += 1) await reset(user.email, wrong(first));
        await allowResend();

        expect((await reset(user.email, await requestCode(user.email))).status).toBe(204);
    });

    it('refuses an expired code', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

        const res = await reset(user.email, code);
        expect(res.status).toBe(400);
        expect(codeError(res)).toBe(INVALID);
    });

    it("refuses one person's code for another person's account", async () => {
        const mine = await createUser('student');
        const theirs = await createUser('student');
        const code = await requestCode(mine.user.email);
        await requestCode(theirs.user.email);

        const res = await reset(theirs.user.email, code);
        // A one in a million chance the two codes are equal
        if (sendEmail.mock.calls[0][0].code !== sendEmail.mock.calls[1][0].code) expect(res.status).toBe(400);
    });

    it('gives the same answer when no code was asked for, or the email has no account', async () => {
        const { user } = await createUser('student');
        const noCode = await reset(user.email, '123456');
        const noAccount = await reset('nobody@example.com', '123456');

        expect(noCode.status).toBe(400);
        expect(noAccount.body).toEqual(noCode.body);
        expect(codeError(noAccount)).toBe(INVALID);
    });

    it('ends every existing login for the account', async () => {
        const { user, auth } = await createUser('student');
        const session = (await login(user.email, 'password123')).body.data;
        expect(await RefreshToken.countDocuments({ user: user.id })).toBe(1);
        // Tokens are timed in whole seconds; this puts the ones above clearly before the reset
        await new Promise((resolve) => setTimeout(resolve, 1100));

        await reset(user.email, await requestCode(user.email));

        expect(await RefreshToken.countDocuments({ user: user.id })).toBe(0);
        expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
        const me = await request(app).get('/api/v1/auth/me').set('Authorization', auth);
        expect(me.status).toBe(401);
        expect(me.body.message).toBe('Your password was changed. Please log in again.');
    });

    it('validates the code before looking anything up', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);

        expect((await verify(user.email, '12345')).status).toBe(400);
        expect((await verify(user.email, 'abcdef')).status).toBe(400);
        // None of those counted as a try
        expect((await PasswordReset.findOne())!.attempts).toBe(0);
        expect((await verify(user.email, code)).status).toBe(200);
    });

    it('removes the pending code when the account is deleted', async () => {
        const admin = await createUser('admin');
        const { user } = await createUser('student');
        await requestCode(user.email);

        await request(app).delete(`/api/v1/users/${user.userId}`).set('Authorization', admin.auth);
        expect(await PasswordReset.countDocuments()).toBe(0);
    });
});

describe('the step between the code and the new password', () => {
    const tokenError = (res: request.Response) => res.body.errors?.find((e: { field: string }) => e.field === 'resetToken')?.message;
    const EXPIRED = 'This password reset has expired or was already used. Ask for a new code.';

    async function verified() {
        const { user } = await createUser('student');
        const res = await verify(user.email, await requestCode(user.email));
        return { user, resetToken: res.body.data.resetToken as string, res };
    }

    it('entering the right code returns a reset token and leaves the password alone', async () => {
        const { user, res } = await verified();

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ resetToken: expect.stringMatching(/^[\w-]{43}$/), expiresInMinutes: 10 });
        expect((await login(user.email, 'password123')).status).toBe(200);
    });

    it('stores only a hash of the reset token, and gives it 10 minutes', async () => {
        const { resetToken } = await verified();
        const [stored] = await PasswordReset.find().lean();

        expect(JSON.stringify(stored)).not.toContain(resetToken);
        expect(stored.resetTokenHash).toMatch(/^[0-9a-f]{64}$/);
        const minutes = (stored.expiresAt.getTime() - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(9.9);
        expect(minutes).toBeLessThanOrEqual(10);
    });

    it('the code cannot be entered a second time', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        await verify(user.email, code);

        const again = await verify(user.email, code);
        expect(again.status).toBe(400);
        expect(codeError(again)).toBe(INVALID);
    });

    it('the reset token sets the password once', async () => {
        const { user, resetToken } = await verified();

        expect((await setPassword(resetToken)).status).toBe(204);
        expect((await login(user.email, 'brand-new-password')).status).toBe(200);

        const second = await setPassword(resetToken, 'another-new-password');
        expect(second.status).toBe(400);
        expect(tokenError(second)).toBe(EXPIRED);
        expect((await login(user.email, 'brand-new-password')).status).toBe(200);
    });

    it('a rejected new password does not use up the reset token', async () => {
        const { user, resetToken } = await verified();

        expect((await setPassword(resetToken, 'short')).status).toBe(400);
        expect((await setPassword(resetToken, null)).status).toBe(400);
        expect((await setPassword(resetToken)).status).toBe(204);
        expect((await login(user.email, 'brand-new-password')).status).toBe(200);
    });

    it('refuses an expired, made-up or missing reset token', async () => {
        const { user, resetToken } = await verified();
        await PasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

        for (const res of [await setPassword(resetToken), await setPassword('x'.repeat(43))]) {
            expect(res.status).toBe(400);
            expect(tokenError(res)).toBe(EXPIRED);
        }
        expect((await setPassword(undefined)).status).toBe(400);
        expect((await login(user.email, 'password123')).status).toBe(200);
    });

    it('the code itself is not accepted in place of the reset token', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);

        const res = await setPassword(code);
        expect(res.status).toBe(400);
        const old = await request(app).post('/api/v1/auth/reset-password').send({ email: user.email, code, newPassword: 'brand-new-password' });
        expect(old.status).toBe(400);
        expect((await login(user.email, 'password123')).status).toBe(200);
    });

    it('asking for a new code cancels a reset token that was not used', async () => {
        const { user, resetToken } = await verified();
        await allowResend();
        await requestCode(user.email);

        const res = await setPassword(resetToken);
        expect(res.status).toBe(400);
        expect(tokenError(res)).toBe(EXPIRED);
    });
});

describe('password reset and the action log', () => {
    it('records the request and the reset, without the code or the password', async () => {
        const { user } = await createUser('student');
        const code = await requestCode(user.email);
        await reset(user.email, code);
        await flushActionLogs();

        const entries = await ActionLog.find({ action: /password_reset/ })
            .sort({ createdAt: 1 })
            .lean();
        expect(entries.map((e) => e.action).sort()).toEqual(['auth:password_reset', 'auth:password_reset_request']);
        for (const entry of entries) expect(entry).toMatchObject({ outcome: 'success', actor: { username: user.username }, target: { type: 'user', id: user.userId } });
        expect(JSON.stringify(entries)).not.toContain(code);
        expect(JSON.stringify(entries)).not.toContain('brand-new-password');
    });

    it('records nothing for an address with no account', async () => {
        await forgot('nobody@example.com');
        await flushActionLogs();
        expect(await ActionLog.countDocuments()).toBe(0);
    });
});
