import request from 'supertest';
import app from '../src/app';
import * as imageStorage from '../src/common/utils/image-storage';
import { ActionLog } from '../src/models/action-log.model';
import { Role } from '../src/models/role.model';
import { User } from '../src/models/user.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

// Pictures go to a stand-in, as in uploads.test.ts
jest.mock('../src/common/utils/image-storage', () => ({
    isImageStorageConfigured: jest.fn(() => true),
    uploadImage: jest.fn(async (_file: Buffer, kind: string, ownerId: string) => ({ url: `https://images.test/${kind}/${ownerId}.jpg`, publicId: `${kind}/${ownerId}` })),
    deleteImage: jest.fn(async () => undefined),
}));
const uploadImage = jest.mocked(imageStorage.uploadImage);
const deleteImage = jest.mocked(imageStorage.deleteImage);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const png = { filename: 'picture.png', contentType: 'image/png' };

beforeAll(connectTestDb);
afterEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();
});
afterAll(closeTestDb);

// Someone who may edit users but not assign roles: the case the rules below are about
async function createEditor() {
    await Role.create({ name: 'registrar', description: 'Keeps student records', permissions: ['user:read', 'user:update'] });
    return createUser('registrar');
}

const edit = (auth: string, userId: string, body: object) => request(app).patch(`/api/v1/users/${userId}`).set('Authorization', auth).send(body);

describe('PATCH /api/v1/users/:id', () => {
    it("lets an admin change another user's username and email", async () => {
        const admin = await createUser('admin');
        for (const role of ['student', 'teacher']) {
            const target = await createUser(role);
            const res = await edit(admin.auth, target.user.userId, { username: `renamed-${role}`, email: `Renamed-${role}@Example.com` });

            expect(res.status).toBe(200);
            expect(res.body.data.user).toMatchObject({ userId: target.user.userId, username: `renamed-${role}`, email: `renamed-${role}@example.com`, role: { name: role } });
            expect(res.body.data.user).not.toHaveProperty('password');
        }
    });

    it('changes only the fields that were sent, and leaves the password alone', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');
        const before = await User.findById(target.user.id).select('+password');

        const res = await edit(admin.auth, target.user.userId, { username: 'renamed' });

        expect(res.body.data.user).toMatchObject({ username: 'renamed', email: target.user.email });
        const after = await User.findById(target.user.id).select('+password');
        expect(after!.password).toBe(before!.password);
        // The person can still log in with the same password, under the same email
        expect((await request(app).post('/api/v1/auth/login').send({ email: target.user.email, password: 'password123' })).status).toBe(200);
    });

    it('cannot be used to change a role or set a password', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');

        const res = await edit(admin.auth, target.user.userId, { username: 'renamed', role: 'admin', password: 'chosen-by-admin' });

        expect(res.status).toBe(200);
        expect(res.body.data.user.role.name).toBe('student');
        expect((await request(app).post('/api/v1/auth/login').send({ email: target.user.email, password: 'chosen-by-admin' })).status).toBe(401);
    });

    it('refuses a username or email that someone else has', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');
        const other = await createUser('student');

        const email = await edit(admin.auth, target.user.userId, { email: other.user.email });
        const username = await edit(admin.auth, target.user.userId, { username: other.user.username });

        expect([email.status, username.status]).toEqual([409, 409]);
        expect(email.body.message).toBe('email already exists');
        // Saving a user's own current values is not a clash
        expect((await edit(admin.auth, target.user.userId, { email: target.user.email, username: target.user.username })).status).toBe(200);
    });

    it('needs the user:update permission', async () => {
        const target = await createUser('student');
        const teacher = await createUser('teacher');
        const student = await createUser('student');

        expect((await edit(teacher.auth, target.user.userId, { username: 'renamed' })).status).toBe(403);
        expect((await edit(student.auth, target.user.userId, { username: 'renamed' })).status).toBe(403);
        expect((await request(app).patch(`/api/v1/users/${target.user.userId}`).send({ username: 'renamed' })).status).toBe(401);
        expect((await User.findById(target.user.id))!.username).toBe(target.user.username);
    });

    it('lets someone without role:assign edit students only', async () => {
        const editor = await createEditor();
        const student = await createUser('student');
        const teacher = await createUser('teacher');
        const admin = await createUser('admin');

        expect((await edit(editor.auth, student.user.userId, { username: 'renamed' })).status).toBe(200);

        for (const target of [teacher, admin]) {
            const res = await edit(editor.auth, target.user.userId, { email: 'mine-now@example.com' });
            expect(res.status).toBe(403);
            expect(res.body.message).toBe('You may only edit users with the "student" role');
            expect((await User.findById(target.user.id))!.email).toBe(target.user.email);
        }
    });

    it('so an admin account cannot be taken over by changing its email and resetting its password', async () => {
        const editor = await createEditor();
        const admin = await createUser('admin');

        await edit(editor.auth, admin.user.userId, { email: editor.user.email.replace('@', '+takeover@') });

        expect((await User.findById(admin.user.id))!.email).toBe(admin.user.email);
    });

    it('validates the body and the id', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');

        expect((await edit(admin.auth, target.user.userId, {})).status).toBe(400);
        expect((await edit(admin.auth, target.user.userId, { email: 'not-an-email' })).status).toBe(400);
        expect((await edit(admin.auth, target.user.userId, { username: 'ab' })).status).toBe(400);
        expect((await edit(admin.auth, 'not-an-id', { username: 'renamed' })).status).toBe(400);
        expect((await edit(admin.auth, 'Unknown0Unknown0', { username: 'renamed' })).status).toBe(404);
    });

    it('is recorded in the action log, with which fields changed', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');
        await edit(admin.auth, target.user.userId, { email: 'new-address@example.com' });
        await flushActionLogs();

        const entry = await ActionLog.findOne({ action: 'user:update' }).lean();
        expect(entry).toMatchObject({ outcome: 'success', actor: { id: admin.user.userId }, target: { type: 'user', id: target.user.userId }, details: { changed: ['email'] } });
    });
});

describe("another user's profile picture", () => {
    const upload = (auth: string, userId: string) => request(app).put(`/api/v1/users/${userId}/avatar`).set('Authorization', auth).attach('image', PNG, png);
    const remove = (auth: string, userId: string) => request(app).delete(`/api/v1/users/${userId}/avatar`).set('Authorization', auth);

    it('can be set and removed by an admin', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');

        const set = await upload(admin.auth, target.user.userId);
        expect(set.status).toBe(200);
        expect(set.body.data.user).toMatchObject({ userId: target.user.userId, avatar: `https://images.test/avatar/${target.user.userId}.jpg` });
        // Stored under the person it belongs to, not the admin who uploaded it
        expect(uploadImage.mock.calls[0].slice(1)).toEqual(['avatar', target.user.userId]);

        const removed = await remove(admin.auth, target.user.userId);
        expect(removed.status).toBe(200);
        expect(removed.body.data.user.avatar).toBeNull();
        expect(deleteImage).toHaveBeenCalledWith(`avatar/${target.user.userId}`);
    });

    it('shows on the account for the person themselves', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');
        await upload(admin.auth, target.user.userId);

        const me = await request(app).get('/api/v1/auth/me').set('Authorization', target.auth);
        expect(me.body.data.user.avatar).toBe(`https://images.test/avatar/${target.user.userId}.jpg`);
    });

    it('follows the same rules as editing: the permission, and students only without role:assign', async () => {
        const editor = await createEditor();
        const teacher = await createUser('teacher');
        const student = await createUser('student');

        expect((await upload(teacher.auth, student.user.userId)).status).toBe(403);
        expect((await upload(editor.auth, teacher.user.userId)).status).toBe(403);
        expect((await remove(editor.auth, teacher.user.userId)).status).toBe(403);
        expect(uploadImage).not.toHaveBeenCalled();

        expect((await upload(editor.auth, student.user.userId)).status).toBe(200);
    });

    it('applies the usual file checks and reports an unknown user', async () => {
        const admin = await createUser('admin');
        const target = await createUser('student');

        const notPicture = await request(app).put(`/api/v1/users/${target.user.userId}/avatar`).set('Authorization', admin.auth).attach('image', Buffer.from('plain text'), png);
        expect(notPicture.status).toBe(400);
        expect((await upload(admin.auth, 'Unknown0Unknown0')).status).toBe(404);
        expect(uploadImage).not.toHaveBeenCalled();
    });
});

describe('the user:update permission', () => {
    it('is in the catalogue and belongs to the admin role', async () => {
        const admin = await createUser('admin');
        const res = await request(app).get('/api/v1/permissions').set('Authorization', admin.auth);
        const me = await request(app).get('/api/v1/auth/me').set('Authorization', admin.auth);

        expect(res.body.data.permissions.map((p: { name: string }) => p.name)).toContain('user:update');
        expect(me.body.data.permissions).toContain('user:update');
    });
});
