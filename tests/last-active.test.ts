import request from 'supertest';
import app from '../src/app';
import { Review } from '../src/models/review.model';
import { User } from '../src/models/user.model';
import { fillLastActiveFromReviews } from '../src/repositories/user.repository';
import { createCollege } from './helpers/data';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const lastActive = async (id: string) => (await User.findById(id))!.lastActiveAt;
const secondsAgo = (date: Date | null) => (date ? (Date.now() - date.getTime()) / 1000 : Infinity);

describe('when a user was last active', () => {
    it('is empty for an account nobody has used yet, and shown as null', async () => {
        const admin = await createUser('admin');
        const fresh = await createUser('student');

        const res = await request(app).get(`/api/v1/users/${fresh.user.userId}`).set('Authorization', admin.auth);
        expect(res.body.data.user.lastActiveAt).toBeNull();
    });

    it('is set by logging in', async () => {
        const { user } = await createUser('student');
        await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'password123' });

        expect(secondsAgo(await lastActive(user.id))).toBeLessThan(5);
    });

    it('is not set by a failed login', async () => {
        const { user } = await createUser('student');
        await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password' });

        expect(await lastActive(user.id)).toBeNull();
    });

    it('is set by using the API, and appears in the list of users', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        await request(app).get('/api/v1/stats/overview').set('Authorization', student.auth);
        // Reading public data without logging in says nothing about anyone
        await request(app).get('/api/v1/colleges');

        const res = await request(app).get('/api/v1/users').set('Authorization', admin.auth);
        const byId = Object.fromEntries(res.body.data.users.map((u: { userId: string; lastActiveAt: string | null }) => [u.userId, u.lastActiveAt]));

        expect(secondsAgo(new Date(byId[student.user.userId]))).toBeLessThan(5);
        expect(secondsAgo(new Date(byId[admin.user.userId]))).toBeLessThan(5);
    });

    it('is written at most once a minute, however many requests are made', async () => {
        const student = await createUser('student');
        await request(app).get('/api/v1/auth/me').set('Authorization', student.auth);
        const first = await lastActive(student.user.id);

        await new Promise((resolve) => setTimeout(resolve, 30));
        await request(app).get('/api/v1/auth/me').set('Authorization', student.auth);
        expect(await lastActive(student.user.id)).toEqual(first);

        // More than a minute since the last time it was noted
        await User.collection.updateOne({ _id: student.user._id }, { $set: { lastActiveAt: new Date(Date.now() - 61_000) } });
        await request(app).get('/api/v1/auth/me').set('Authorization', student.auth);
        expect(secondsAgo(await lastActive(student.user.id))).toBeLessThan(5);
    });

    it('is set by writing a review', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        await request(app).post('/api/v1/reviews').set('Authorization', student.auth).send({ college: college.collegeId, rating: 4, comment: 'A good place to study overall' });

        expect(secondsAgo(await lastActive(student.user.id))).toBeLessThan(5);
    });

    it('is filled in from the latest review for accounts with no recorded activity', async () => {
        const reviewer = await createUser('student');
        const quiet = await createUser('student');
        const recent = await createUser('student');
        const [a, b] = [await createCollege(), await createCollege()];
        const older = new Date('2026-03-01T10:00:00Z');
        const newer = new Date('2026-04-15T10:00:00Z');
        // Reviews written before activity was recorded; the later one was edited after it was written
        await Review.collection.insertMany([
            { college: a._id, user: reviewer.user._id, rating: 4, comment: 'Solid teaching all round', reviewId: 'OldReview0000001', createdAt: older, updatedAt: older },
            { college: b._id, user: reviewer.user._id, rating: 2, comment: 'Facilities need attention', reviewId: 'OldReview0000002', createdAt: older, updatedAt: newer },
            { college: a._id, user: recent.user._id, rating: 5, comment: 'Excellent in every respect', reviewId: 'OldReview0000003', createdAt: older, updatedAt: older },
        ]);
        // This account has been seen since; that must not be replaced by an older review date
        const seen = new Date('2026-09-01T10:00:00Z');
        await User.collection.updateOne({ _id: recent.user._id }, { $set: { lastActiveAt: seen } });

        expect(await fillLastActiveFromReviews()).toBe(1);

        expect(await lastActive(reviewer.user.id)).toEqual(newer);
        expect(await lastActive(quiet.user.id)).toBeNull();
        expect(await lastActive(recent.user.id)).toEqual(seen);
        // Nothing left to do on the next start
        expect(await fillLastActiveFromReviews()).toBe(0);
    });

    it('does not count as an edit of the account', async () => {
        const student = await createUser('student');
        const before = (await User.findById(student.user.id))!.updatedAt;
        await new Promise((resolve) => setTimeout(resolve, 20));

        await request(app).get('/api/v1/auth/me').set('Authorization', student.auth);

        expect((await User.findById(student.user.id))!.updatedAt).toEqual(before);
    });
});
