import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import { PUBLIC_ID_PATTERN, generatePublicId } from '../src/common/utils/utils';
import { ActionLog } from '../src/models/action-log.model';
import { College } from '../src/models/college.model';
import { PasswordReset } from '../src/models/password-reset.model';
import { RefreshToken } from '../src/models/refresh-token.model';
import { Review } from '../src/models/review.model';
import { Role } from '../src/models/role.model';
import { User } from '../src/models/user.model';
import { flushActionLogs } from '../src/services/action-log.service';
import { backfillPublicIds, convertActionLogIds } from '../src/services/public-id.service';
import { syncRoles } from '../src/services/role.service';
import { createUser } from './helpers/auth';
import { createCollege, rateCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const comment = 'Good teaching and a lively campus';

// Every place in a response where MongoDB's own id could show
function mongoIdsIn(value: unknown, path = ''): string[] {
    if (Array.isArray(value)) return value.flatMap((item, i) => mongoIdsIn(item, `${path}[${i}]`));
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, inner]) => (key === '_id' ? [`${path}._id`] : mongoIdsIn(inner, `${path}.${key}`)));
    }
    return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value) ? [`${path} = ${value}`] : [];
}

describe('public ids', () => {
    it('are 16 letters and digits, and different every time', () => {
        const ids = Array.from({ length: 2000 }, () => generatePublicId());
        for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{16}$/);
        expect(new Set(ids).size).toBe(ids.length);
        expect(PUBLIC_ID_PATTERN.test(ids[0])).toBe(true);
    });

    it('are given to every kind of record as it is created', async () => {
        const { user } = await createUser('student');
        const college = await createCollege();
        await rateCollege(college.id, [4]);
        await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'password123' });
        await PasswordReset.create({ user: user.id, codeHash: 'x', sentAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
        await flushActionLogs();

        expect(user.userId).toMatch(PUBLIC_ID_PATTERN);
        expect(college.collegeId).toMatch(PUBLIC_ID_PATTERN);
        expect((await Review.findOne())!.reviewId).toMatch(PUBLIC_ID_PATTERN);
        expect((await ActionLog.findOne())!.logId).toMatch(PUBLIC_ID_PATTERN);
        expect((await RefreshToken.findOne())!.refreshTokenId).toMatch(PUBLIC_ID_PATTERN);
        expect((await PasswordReset.findOne())!.passwordResetId).toMatch(PUBLIC_ID_PATTERN);
        for (const role of await Role.find()) expect(role.roleId).toMatch(PUBLIC_ID_PATTERN);
    });

    it('stay the same for a role across restarts', async () => {
        const before = (await Role.findOne({ name: 'admin' }))!.roleId;
        await syncRoles();
        await syncRoles();
        expect((await Role.findOne({ name: 'admin' }))!.roleId).toBe(before);
    });

    it('cannot be changed once given, and no two records can share one', async () => {
        const { user } = await createUser('student');
        const original = user.userId;

        user.userId = 'Changed0Changed0';
        await user.save();
        expect((await User.findById(user.id))!.userId).toBe(original);

        const role = await Role.findOne({ name: 'student' });
        await expect(User.create({ username: 'copycat', email: 'copycat@example.com', password: 'password123', role: role!._id, userId: original })).rejects.toMatchObject({
            code: 11000,
        });
    });

    it('cannot be chosen or changed through the API', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        const wanted = 'Chosen00Chosen00';

        const created = await request(app)
            .post('/api/v1/colleges')
            .set('Authorization', admin.auth)
            .send({ name: 'New College', country: 'India', city: 'Salem', state: 'Tamil Nadu', collegeId: wanted });
        const edited = await request(app).patch(`/api/v1/colleges/${college.collegeId}`).set('Authorization', admin.auth).send({ city: 'Erode', collegeId: wanted });

        expect(created.body.data.college.collegeId).not.toBe(wanted);
        expect(edited.body.data.college.collegeId).toBe(college.collegeId);
    });
});

describe("MongoDB's own ids", () => {
    it('never appear in anything the API returns', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const college = await createCollege();
        const review = await request(app).post('/api/v1/reviews').set('Authorization', student.auth).send({ college: college.collegeId, rating: 5, comment });
        const login = await request(app).post('/api/v1/auth/login').send({ email: student.user.email, password: 'password123' });
        await flushActionLogs();

        const get = (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', admin.auth);
        const responses = {
            login,
            review,
            me: await get('/auth/me'),
            users: await get('/users'),
            user: await get(`/users/${student.user.userId}`),
            roles: await get('/roles'),
            colleges: await get('/colleges'),
            college: await get(`/colleges/${college.collegeId}`),
            reviews: await get('/reviews'),
            oneReview: await get(`/reviews/${review.body.data.review.reviewId}`),
            logs: await get('/action-logs'),
            stats: await get('/stats/overview'),
        };

        for (const [name, res] of Object.entries(responses)) {
            expect(res.status).toBeLessThan(300);
            expect({ [name]: mongoIdsIn(res.body) }).toEqual({ [name]: [] });
        }
        // ...and the public ids are there instead
        expect(responses.user.body.data.user).toMatchObject({ userId: student.user.userId, role: { roleId: expect.stringMatching(PUBLIC_ID_PATTERN), name: 'student' } });
        expect(responses.college.body.data.college).toMatchObject({ collegeId: college.collegeId, createdBy: expect.stringMatching(PUBLIC_ID_PATTERN) });
        expect(responses.oneReview.body.data.review).toMatchObject({ user: { userId: student.user.userId }, college: { collegeId: college.collegeId } });
        expect(responses.logs.body.data.logs[0].logId).toMatch(PUBLIC_ID_PATTERN);
    });

    it('are not in the access token either', async () => {
        const { user } = await createUser('student');
        const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'password123' });
        const payload = jwt.decode(res.body.data.token) as { sub: string };

        expect(payload.sub).toBe(user.userId);
        expect(JSON.stringify(payload)).not.toContain(user.id);
    });

    it('are not accepted where an id is asked for', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        const college = await createCollege();

        const responses = [
            await request(app).get(`/api/v1/users/${student.user.id}`).set('Authorization', admin.auth),
            await request(app).get(`/api/v1/colleges/${college.id}`),
            await request(app).delete(`/api/v1/colleges/${college.id}`).set('Authorization', admin.auth),
            await request(app).get(`/api/v1/reviews?college=${college.id}`),
            await request(app).post('/api/v1/reviews').set('Authorization', student.auth).send({ college: college.id, rating: 5, comment }),
        ];
        for (const res of responses) {
            expect(res.status).toBe(400);
            expect(res.body.errors[0].message).toContain('must be a valid id');
        }
        expect(await College.countDocuments()).toBe(1);
    });

    it('show a college creator as null once that account is deleted', async () => {
        const admin = await createUser('admin');
        const teacher = await createUser('teacher');
        const college = await createCollege({ createdBy: teacher.user.id });
        await request(app).delete(`/api/v1/users/${teacher.user.userId}`).set('Authorization', admin.auth);

        const res = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(res.body.data.college.createdBy).toBeNull();
    });
});

describe('records made before public ids existed', () => {
    // Written straight into the database, as older records were: no public id
    const insertOld = (model: mongoose.Model<any>, fields: object) =>
        model.collection.insertOne({ ...fields, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });

    it('are each given an id, without touching anything else about them', async () => {
        const role = await Role.findOne({ name: 'student' });
        const { insertedId: oldUser } = await insertOld(User, { username: 'veteran', email: 'veteran@example.com', password: 'x', role: role!._id });
        const { insertedId: oldCollege } = await insertOld(College, { name: 'Old College', city: 'Chennai', state: 'Tamil Nadu', description: '', createdBy: oldUser });
        await insertOld(College, { name: 'Older College', city: 'Chennai', state: 'Tamil Nadu', description: '', createdBy: oldUser });
        await insertOld(Review, { college: oldCollege, user: oldUser, rating: 4, comment });
        const existing = await createUser('teacher');

        const filled = await backfillPublicIds();

        expect(filled).toEqual({ userId: 1, collegeId: 2, reviewId: 1 });
        const user = await User.collection.findOne({ _id: oldUser });
        expect(user!.userId).toMatch(PUBLIC_ID_PATTERN);
        // Not counted as an edit
        expect(user!.updatedAt).toEqual(new Date('2026-01-01'));
        const colleges = await College.find();
        expect(new Set(colleges.map((c) => c.collegeId)).size).toBe(2);
        // A record that already had an id keeps it
        expect((await User.findById(existing.user.id))!.userId).toBe(existing.user.userId);
    });

    it('keep the id they were given on later runs', async () => {
        const role = await Role.findOne({ name: 'student' });
        const { insertedId } = await insertOld(User, { username: 'veteran', email: 'veteran@example.com', password: 'x', role: role!._id });
        await backfillPublicIds();
        const first = (await User.collection.findOne({ _id: insertedId }))!.userId;

        expect(await backfillPublicIds()).toEqual({});
        expect((await User.collection.findOne({ _id: insertedId }))!.userId).toBe(first);
    });

    it('can be used through the API afterwards', async () => {
        const admin = await createUser('admin');
        const { insertedId } = await insertOld(College, { name: 'Old College', city: 'Chennai', state: 'Tamil Nadu', description: '', createdBy: admin.user._id });
        await backfillPublicIds();
        const { collegeId } = (await College.findById(insertedId))!;

        const res = await request(app).get(`/api/v1/colleges/${collegeId}`);
        expect(res.status).toBe(200);
        expect(res.body.data.college).toMatchObject({ name: 'Old College', collegeId, createdBy: admin.user.userId });
    });

    it('have the ids inside their action log entries rewritten to public ids', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        const gone = new mongoose.Types.ObjectId();
        const old = { outcome: 'success', details: {}, ip: null, method: 'PATCH', statusCode: 200, createdAt: new Date('2026-01-01') };
        // The actor was stored as an ObjectId, the target as its text form
        await ActionLog.collection.insertMany([
            { ...old, action: 'college:update', path: '/a', actor: { id: admin.user._id, username: 'admin' }, target: { type: 'college', id: college.id } },
            { ...old, action: 'user:delete', path: '/b', actor: { id: admin.user._id, username: 'admin' }, target: { type: 'user', id: String(gone) } },
        ]);
        await backfillPublicIds();

        const changed = await convertActionLogIds();

        const [update, removal] = await ActionLog.find().sort({ path: 1 }).lean();
        expect(update).toMatchObject({ actor: { id: admin.user.userId }, target: { id: college.collegeId } });
        // The deleted user cannot be matched to anything, so that id is left as it was
        expect(removal).toMatchObject({ actor: { id: admin.user.userId }, target: { id: String(gone) } });
        expect(changed).toBe(3);
        expect(await convertActionLogIds()).toBe(0);

        const res = await request(app).get(`/api/v1/action-logs?actor=${admin.user.userId}`).set('Authorization', admin.auth);
        expect(res.body.meta.total).toBe(2);
    });
});
