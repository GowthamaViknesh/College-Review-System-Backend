import request from 'supertest';
import app from '../src/app';
import * as imageStorage from '../src/common/utils/image-storage';
import { MAX_IMAGE_BYTES } from '../src/common/middlewares/upload.middleware';
import { ActionLog } from '../src/models/action-log.model';
import { College } from '../src/models/college.model';
import { Review } from '../src/models/review.model';
import { User } from '../src/models/user.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { createUser } from './helpers/auth';
import { createCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

// The real storage is a paid service on the internet, so these tests use a stand-in that hands back
// an address the way the real one does. Each upload gets a new address, as a replaced picture would.
let mockUploads = 0;
jest.mock('../src/common/utils/image-storage', () => ({
    isImageStorageConfigured: jest.fn(() => true),
    uploadImage: jest.fn(async (_file: Buffer, kind: string, ownerId: string) => {
        mockUploads += 1;
        return { url: `https://images.test/v${mockUploads}/${kind}/${ownerId}.jpg`, publicId: `${kind}/${ownerId}` };
    }),
    deleteImage: jest.fn(async () => undefined),
}));

const uploadImage = jest.mocked(imageStorage.uploadImage);
const deleteImage = jest.mocked(imageStorage.deleteImage);

// The smallest thing the API accepts as a picture: the bytes every PNG file starts with
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const png = { filename: 'picture.png', contentType: 'image/png' };

const imageError = (res: request.Response) => res.body.errors?.find((e: { field: string }) => e.field === 'image')?.message;

beforeAll(connectTestDb);
afterEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();
});
afterAll(closeTestDb);

describe('PUT /api/v1/auth/me/avatar', () => {
    it('lets any logged-in user set their profile picture', async () => {
        for (const role of ['student', 'teacher', 'admin']) {
            const me = await createUser(role);
            const res = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);

            expect(res.status).toBe(200);
            expect(res.body.data.user).toMatchObject({ username: me.user.username, role: { name: role } });
            expect(res.body.data.user.avatar).toMatch(new RegExp(`^https://images\\.test/v\\d+/avatar/${me.user.id}\\.jpg$`));
        }
    });

    it('shows the picture wherever the account is returned, as an address only', async () => {
        const me = await createUser('student');
        const admin = await createUser('admin');
        const upload = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);
        const address = upload.body.data.user.avatar;

        const profile = await request(app).get('/api/v1/auth/me').set('Authorization', me.auth);
        const list = await request(app).get('/api/v1/users').set('Authorization', admin.auth);

        expect(profile.body.data.user.avatar).toBe(address);
        expect(list.body.data.users.find((u: { _id: string }) => u._id === me.user.id).avatar).toBe(address);
        // The id the picture is stored under stays on the server
        expect(JSON.stringify([upload.body, profile.body, list.body])).not.toContain('publicId');
        expect((await User.findById(me.user.id))!.avatar).toMatchObject({ url: address, publicId: `avatar/${me.user.id}` });
    });

    it('is null for an account without a picture', async () => {
        const me = await createUser('student');
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', me.auth);
        expect(res.body.data.user.avatar).toBeNull();
    });

    it('replaces the previous picture when uploading again', async () => {
        const me = await createUser('student');
        const first = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);
        const second = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);

        expect(second.body.data.user.avatar).not.toBe(first.body.data.user.avatar);
        // Both uploads went to the same slot, so the first picture was overwritten, not left behind
        expect(uploadImage.mock.calls.map(([, kind, owner]) => `${kind}/${owner}`)).toEqual([`avatar/${me.user.id}`, `avatar/${me.user.id}`]);
    });

    it('needs a login, and reads nothing from someone who is not logged in', async () => {
        const res = await request(app).put('/api/v1/auth/me/avatar').attach('image', PNG, png);
        expect(res.status).toBe(401);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('rejects a request with no picture', async () => {
        const me = await createUser('student');
        const empty = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth);
        const wrongField = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('photo', PNG, png);

        expect(empty.status).toBe(400);
        expect(imageError(empty)).toContain('Choose a picture');
        expect(wrongField.status).toBe(400);
        expect(imageError(wrongField)).toContain('form field named "image"');
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('rejects a file that is not a JPG, PNG or WebP', async () => {
        const me = await createUser('student');
        const res = await request(app)
            .put('/api/v1/auth/me/avatar')
            .set('Authorization', me.auth)
            .attach('image', Buffer.from('%PDF-1.7 not a picture'), { filename: 'cv.pdf', contentType: 'application/pdf' });

        expect(res.status).toBe(400);
        expect(imageError(res)).toBe('Upload a JPG, PNG or WebP picture');
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('rejects a file that only claims to be a picture', async () => {
        const me = await createUser('student');
        const res = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', Buffer.from('<script>alert(1)</script>'), png);

        expect(res.status).toBe(400);
        expect(imageError(res)).toBe('Upload a JPG, PNG or WebP picture');
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('accepts JPG and WebP as well as PNG', async () => {
        const me = await createUser('student');
        const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
        const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]);

        const asJpeg = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
        const asWebp = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', webp, { filename: 'a.webp', contentType: 'image/webp' });

        expect([asJpeg.status, asWebp.status]).toEqual([200, 200]);
    });

    it('rejects a picture larger than 5 MB', async () => {
        const me = await createUser('student');
        const tooLarge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
        const res = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', tooLarge, png);

        expect(res.status).toBe(400);
        expect(imageError(res)).toBe('The picture must be 5 MB or smaller');
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('reports a storage failure without changing the account', async () => {
        const me = await createUser('student');
        uploadImage.mockRejectedValueOnce(new Error('storage is down'));
        const res = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);

        expect(res.status).toBe(500);
        expect((await User.findById(me.user.id))!.avatar).toBeNull();
    });

    it('records the change in the action log', async () => {
        const me = await createUser('student');
        await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);
        await flushActionLogs();

        const entry = await ActionLog.findOne({ action: 'profile:update' });
        expect(entry).toMatchObject({ outcome: 'success', details: { changed: ['avatar'] } });
        expect(String(entry!.target.id)).toBe(me.user.id);
    });
});

describe('DELETE /api/v1/auth/me/avatar', () => {
    it('removes the picture from the account and from storage', async () => {
        const me = await createUser('student');
        await request(app).put('/api/v1/auth/me/avatar').set('Authorization', me.auth).attach('image', PNG, png);

        const res = await request(app).delete('/api/v1/auth/me/avatar').set('Authorization', me.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.user.avatar).toBeNull();
        expect(deleteImage).toHaveBeenCalledWith(`avatar/${me.user.id}`);
    });

    it('succeeds when there was no picture', async () => {
        const me = await createUser('student');
        const res = await request(app).delete('/api/v1/auth/me/avatar').set('Authorization', me.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.user.avatar).toBeNull();
        expect(deleteImage).not.toHaveBeenCalled();
    });

    it('needs a login', async () => {
        expect((await request(app).delete('/api/v1/auth/me/avatar')).status).toBe(401);
    });
});

describe('PUT /api/v1/colleges/:id/image', () => {
    it('lets someone who may edit colleges set the picture', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();
        const res = await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth).attach('image', PNG, png);

        expect(res.status).toBe(200);
        expect(res.body.data.college).toMatchObject({ name: college.name, averageRating: null, reviewCount: 0 });
        expect(res.body.data.college.image).toMatch(new RegExp(`/college/${college.id}\\.jpg$`));
    });

    it('shows the picture in the list and on the college, as an address only', async () => {
        const teacher = await createUser('teacher');
        const withPicture = await createCollege();
        const without = await createCollege();
        const upload = await request(app).put(`/api/v1/colleges/${withPicture.id}/image`).set('Authorization', teacher.auth).attach('image', PNG, png);
        const address = upload.body.data.college.image;

        const list = await request(app).get('/api/v1/colleges');
        const one = await request(app).get(`/api/v1/colleges/${withPicture.id}`);
        const byId = Object.fromEntries(list.body.data.colleges.map((c: { _id: string; image: string | null }) => [c._id, c.image]));

        expect(byId[withPicture.id]).toBe(address);
        expect(byId[without.id]).toBeNull();
        expect(one.body.data.college.image).toBe(address);
        expect(JSON.stringify([upload.body, list.body, one.body])).not.toContain('publicId');
    });

    it('is refused without the college:update permission, before anything is uploaded', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const res = await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', student.auth).attach('image', PNG, png);
        const anonymous = await request(app).put(`/api/v1/colleges/${college.id}/image`).attach('image', PNG, png);

        expect(res.status).toBe(403);
        expect(anonymous.status).toBe(401);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('uploads nothing for a college that does not exist', async () => {
        const teacher = await createUser('teacher');
        const missing = await request(app).put('/api/v1/colleges/66f1a2b3c4d5e6f7a8b9c0d3/image').set('Authorization', teacher.auth).attach('image', PNG, png);
        const malformed = await request(app).put('/api/v1/colleges/not-an-id/image').set('Authorization', teacher.auth).attach('image', PNG, png);

        expect(missing.status).toBe(404);
        expect(malformed.status).toBe(400);
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('applies the same file checks as profile pictures', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();
        const res = await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth).attach('image', Buffer.from('plain text'), png);

        expect(res.status).toBe(400);
        expect(imageError(res)).toBe('Upload a JPG, PNG or WebP picture');
    });

    it('records the change in the action log', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();
        await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth).attach('image', PNG, png);
        await flushActionLogs();

        const entry = await ActionLog.findOne({ action: 'college:update' });
        expect(entry).toMatchObject({ outcome: 'success', details: { changed: ['image'] } });
        expect(String(entry!.target.id)).toBe(college.id);
    });
});

describe('DELETE /api/v1/colleges/:id/image', () => {
    it('removes the picture from the college and from storage', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();
        await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth).attach('image', PNG, png);

        const res = await request(app).delete(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.college.image).toBeNull();
        expect(deleteImage).toHaveBeenCalledWith(`college/${college.id}`);
    });

    it('succeeds when there was no picture, and is refused without permission', async () => {
        const teacher = await createUser('teacher');
        const student = await createUser('student');
        const college = await createCollege();

        expect((await request(app).delete(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth)).status).toBe(200);
        expect((await request(app).delete(`/api/v1/colleges/${college.id}/image`).set('Authorization', student.auth)).status).toBe(403);
        expect((await request(app).delete('/api/v1/colleges/66f1a2b3c4d5e6f7a8b9c0d3/image').set('Authorization', teacher.auth)).status).toBe(404);
        expect(deleteImage).not.toHaveBeenCalled();
    });
});

describe('pictures of things that are deleted', () => {
    it('removes a college picture from storage when the college is deleted', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', admin.auth).attach('image', PNG, png);

        const res = await request(app).delete(`/api/v1/colleges/${college.id}`).set('Authorization', admin.auth);

        expect(res.status).toBe(204);
        expect(deleteImage).toHaveBeenCalledWith(`college/${college.id}`);
        expect(await College.countDocuments()).toBe(0);
    });

    it('removes a profile picture from storage when the account is deleted', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        await request(app).put('/api/v1/auth/me/avatar').set('Authorization', student.auth).attach('image', PNG, png);

        const res = await request(app).delete(`/api/v1/users/${student.user.id}`).set('Authorization', admin.auth);

        expect(res.status).toBe(204);
        expect(deleteImage).toHaveBeenCalledWith(`avatar/${student.user.id}`);
    });

    it('asks storage for nothing when there was no picture', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        await request(app).delete(`/api/v1/colleges/${college.id}`).set('Authorization', admin.auth);
        expect(deleteImage).not.toHaveBeenCalled();
    });
});

describe('reviews', () => {
    it("show the author's profile picture next to their name", async () => {
        const student = await createUser('student');
        const other = await createUser('student');
        const college = await createCollege();
        const upload = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', student.auth).attach('image', PNG, png);
        await Review.create({ college: college.id, user: student.user.id, rating: 5, comment: 'Excellent teaching and facilities' });
        await Review.create({ college: college.id, user: other.user.id, rating: 3, comment: 'Average, but improving every year' });

        const res = await request(app).get(`/api/v1/reviews?college=${college.id}&sort=highest`);
        const [withPicture, without] = res.body.data.reviews;

        expect(withPicture.user).toEqual({ _id: student.user.id, username: student.user.username, avatar: upload.body.data.user.avatar });
        expect(without.user).toEqual({ _id: other.user.id, username: other.user.username, avatar: null });
    });
});
