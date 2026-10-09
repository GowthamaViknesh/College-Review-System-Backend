import request from 'supertest';
import app from '../src/app';
import { createUser } from './helpers/auth';
import { createCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

// Unlike uploads.test.ts this uses the real storage code, with no CLOUDINARY_* settings: the state of
// a fresh clone, of CI, and of anyone who has not signed up for image storage.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const png = { filename: 'picture.png', contentType: 'image/png' };

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

describe('picture uploads without image storage set up', () => {
    it('answers 503 with a clear message instead of failing', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();

        const avatar = await request(app).put('/api/v1/auth/me/avatar').set('Authorization', teacher.auth).attach('image', PNG, png);
        const image = await request(app).put(`/api/v1/colleges/${college.id}/image`).set('Authorization', teacher.auth).attach('image', PNG, png);

        for (const res of [avatar, image]) {
            expect(res.status).toBe(503);
            expect(res.body).toEqual({ success: false, message: 'Picture uploads are not set up on this server' });
        }
    });

    it('leaves the rest of the API working, with pictures simply absent', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();

        const me = await request(app).get('/api/v1/auth/me').set('Authorization', teacher.auth);
        const one = await request(app).get(`/api/v1/colleges/${college.id}`);
        const remove = await request(app).delete('/api/v1/auth/me/avatar').set('Authorization', teacher.auth);

        expect(me.body.data.user.avatar).toBeNull();
        expect(one.body.data.college.image).toBeNull();
        expect(remove.status).toBe(200);
    });
});
