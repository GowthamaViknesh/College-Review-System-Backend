import request from 'supertest';
import app from '../src/app';
import { Review } from '../src/models/review.model';
import { createUser } from './helpers/auth';
import { createCollege, rateCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const DAY_MS = 24 * 60 * 60 * 1000;
const dateKey = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

describe('GET /api/v1/stats/overview', () => {
    it('requires a token but no particular permission', async () => {
        expect((await request(app).get('/api/v1/stats/overview')).status).toBe(401);

        for (const role of ['student', 'teacher', 'admin']) {
            const { auth } = await createUser(role);
            expect((await request(app).get('/api/v1/stats/overview').set('Authorization', auth)).status).toBe(200);
        }
    });

    it('returns zeros, a null average and every day and rating when there is no data', async () => {
        const student = await createUser('student');

        const res = await request(app).get('/api/v1/stats/overview').set('Authorization', student.auth);

        expect(res.body.data.totals).toEqual({ colleges: 0, reviews: 0, averageRating: null, myReviews: 0 });
        expect(res.body.data.reviewsPerDay).toHaveLength(7);
        expect(res.body.data.reviewsPerDay.every((day: { count: number }) => day.count === 0)).toBe(true);
        expect(res.body.data.ratingDistribution).toEqual([1, 2, 3, 4, 5].map((rating) => ({ rating, count: 0 })));
    });

    it('counts colleges, reviews, the overall average and the rating distribution', async () => {
        const student = await createUser('student');
        const a = await createCollege();
        const b = await createCollege();
        await rateCollege(a.id, [5, 5, 4]);
        await rateCollege(b.id, [2, 4, 4, 4]); // all seven: 28 / 7 = 4

        const res = await request(app).get('/api/v1/stats/overview').set('Authorization', student.auth);

        expect(res.body.data.totals).toMatchObject({ colleges: 2, reviews: 7, averageRating: 4 });
        expect(res.body.data.ratingDistribution).toEqual([
            { rating: 1, count: 0 },
            { rating: 2, count: 1 },
            { rating: 3, count: 0 },
            { rating: 4, count: 4 },
            { rating: 5, count: 2 },
        ]);
    });

    it('counts only the logged-in user’s own reviews in myReviews', async () => {
        const student = await createUser('student');
        const other = await createUser('student');
        const [a, b] = [await createCollege(), await createCollege()];
        await Review.create({ college: a.id, user: student.user.id, rating: 5, comment: 'A great place to study' });
        await Review.create({ college: b.id, user: student.user.id, rating: 3, comment: 'An average place to study' });
        await Review.create({ college: a.id, user: other.user.id, rating: 1, comment: 'Not a good place to study' });

        const mine = await request(app).get('/api/v1/stats/overview').set('Authorization', student.auth);
        const theirs = await request(app).get('/api/v1/stats/overview').set('Authorization', other.auth);

        expect(mine.body.data.totals).toMatchObject({ reviews: 3, myReviews: 2 });
        expect(theirs.body.data.totals).toMatchObject({ reviews: 3, myReviews: 1 });
    });

    it('groups reviews by the day they were written, for the last 7 days only, oldest first', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const writtenDaysAgo = [0, 0, 2, 6, 7, 30]; // the last two are outside the window
        for (const daysAgo of writtenDaysAgo) {
            const { user } = await createUser('student');
            const createdAt = new Date(`${dateKey(daysAgo)}T12:00:00.000Z`);
            await Review.create({ college: college.id, user: user.id, rating: 4, comment: 'Written some days ago', createdAt });
        }

        const res = await request(app).get('/api/v1/stats/overview').set('Authorization', student.auth);

        expect(res.body.data.reviewsPerDay).toEqual([
            { date: dateKey(6), count: 1 },
            { date: dateKey(5), count: 0 },
            { date: dateKey(4), count: 0 },
            { date: dateKey(3), count: 0 },
            { date: dateKey(2), count: 1 },
            { date: dateKey(1), count: 0 },
            { date: dateKey(0), count: 2 },
        ]);
        // Older reviews still count towards the totals
        expect(res.body.data.totals.reviews).toBe(6);
    });
});
