import request from 'supertest';
import app from '../src/app';
import { Review } from '../src/models/review.model';
import { createUser } from './helpers/auth';
import { createCollege, rateCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const UNKNOWN_ID = '64b7f0000000000000000000';
const comment = 'Good faculty and placements, but the hostel needs work.';
const ratings = (res: request.Response) => res.body.data.reviews.map((r: { rating: number }) => r.rating);

async function postReview(auth: string, body: object) {
    return request(app).post('/api/v1/reviews').set('Authorization', auth).send(body);
}

describe('POST /api/v1/reviews', () => {
    it('lets a student review a college', async () => {
        const student = await createUser('student');
        const college = await createCollege({ name: 'Anna University' });

        const res = await postReview(student.auth, { college: college.id, rating: 4, comment });

        expect(res.status).toBe(201);
        expect(res.body.data.review).toMatchObject({
            rating: 4,
            comment,
            user: { _id: student.user.id, username: student.user.username },
            college: { _id: college.id, name: 'Anna University' },
        });
    });

    it('does not let a teacher write a review, because ratings come from students', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege();

        const res = await postReview(teacher.auth, { college: college.id, rating: 5, comment });

        expect(res.status).toBe(403);
        expect(await Review.countDocuments()).toBe(0);
    });

    it('rejects a request with no token', async () => {
        const college = await createCollege();
        const res = await request(app).post('/api/v1/reviews').send({ college: college.id, rating: 5, comment });
        expect(res.status).toBe(401);
    });

    it('allows only one review per student per college', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const another = await createCollege();
        await postReview(student.auth, { college: college.id, rating: 5, comment });

        const second = await postReview(student.auth, { college: college.id, rating: 5, comment });
        expect(second.status).toBe(409);
        expect(await Review.countDocuments({ college: college.id })).toBe(1);

        // The same student may still review a different college
        expect((await postReview(student.auth, { college: another.id, rating: 3, comment })).status).toBe(201);
    });

    it('enforces one review per student per college in the database itself', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const review = { college: college.id, user: student.user.id, rating: 5, comment };
        await Review.create(review);

        await expect(Review.create(review)).rejects.toThrow(/duplicate key/);
    });

    it('lets only one of two simultaneous reviews through', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const body = { college: college.id, rating: 5, comment };

        const results = await Promise.all([postReview(student.auth, body), postReview(student.auth, body)]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await Review.countDocuments()).toBe(1);
    });

    it('returns 404 when the college does not exist', async () => {
        const student = await createUser('student');
        const res = await postReview(student.auth, { college: UNKNOWN_ID, rating: 5, comment });
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('College not found');
    });

    it.each([0, 6, 3.5, 'five'])('rejects a rating of %p', async (rating) => {
        const student = await createUser('student');
        const college = await createCollege();
        const res = await postReview(student.auth, { college: college.id, rating, comment });
        expect(res.status).toBe(400);
        expect(res.body.errors[0].field).toBe('rating');
    });

    it('rejects a missing or too-short comment and a malformed college id', async () => {
        const student = await createUser('student');
        const res = await postReview(student.auth, { college: 'nope', rating: 4, comment: 'ok' });
        expect(res.status).toBe(400);
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['college', 'comment']);
    });

    it('ignores an attempt to post as someone else', async () => {
        const student = await createUser('student');
        const victim = await createUser('student');
        const college = await createCollege();

        const res = await postReview(student.auth, { college: college.id, rating: 1, comment, user: victim.user.id });

        expect(res.status).toBe(201);
        expect(res.body.data.review.user._id).toBe(student.user.id);
    });
});

describe('GET /api/v1/reviews', () => {
    it('is public, paginated and newest first', async () => {
        const college = await createCollege();
        await rateCollege(college.id, [1, 2, 3]);

        const res = await request(app).get('/api/v1/reviews?limit=2');

        expect(res.status).toBe(200);
        expect(ratings(res)).toEqual([3, 2]);
        expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
        expect(ratings(await request(app).get('/api/v1/reviews?limit=2&page=2'))).toEqual([1]);
    });

    it('filters by college and by author', async () => {
        const a = await createCollege();
        const b = await createCollege();
        const student = await createUser('student');
        await Review.create({ college: a.id, user: student.user.id, rating: 5, comment });
        await rateCollege(a.id, [1]);
        await rateCollege(b.id, [3]);

        const byCollege = await request(app).get(`/api/v1/reviews?college=${a.id}&sort=highest`);
        expect(ratings(byCollege)).toEqual([5, 1]);

        const byUser = await request(app).get(`/api/v1/reviews?user=${student.user.id}`);
        expect(ratings(byUser)).toEqual([5]);
    });

    it('filters by rating range and sorts by rating', async () => {
        const college = await createCollege();
        await rateCollege(college.id, [1, 2, 3, 4, 5]);

        expect(ratings(await request(app).get('/api/v1/reviews?minRating=4&sort=lowest'))).toEqual([4, 5]);
        expect(ratings(await request(app).get('/api/v1/reviews?maxRating=2&sort=highest'))).toEqual([2, 1]);
        expect(ratings(await request(app).get('/api/v1/reviews?minRating=2&maxRating=4&sort=oldest'))).toEqual([2, 3, 4]);
    });

    it('searches the comment text, treating regex characters as plain text', async () => {
        const college = await createCollege();
        const [one, two] = [await createUser('student'), await createUser('student')];
        await Review.create({ college: college.id, user: one.user.id, rating: 5, comment: 'The LIBRARY is open all night' });
        await Review.create({ college: college.id, user: two.user.id, rating: 2, comment: 'Canteen food could be better' });

        expect(ratings(await request(app).get('/api/v1/reviews?search=library'))).toEqual([5]);
        expect(ratings(await request(app).get('/api/v1/reviews?search=.*'))).toEqual([]);
    });

    it('rejects invalid query values', async () => {
        const res = await request(app).get('/api/v1/reviews?college=nope&minRating=4&maxRating=2&sort=random');
        expect(res.status).toBe(400);
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['college', 'maxRating', 'sort']);
    });
});

describe('GET /api/v1/reviews/:id', () => {
    it('is public, and returns 404 for an unknown id', async () => {
        const student = await createUser('student');
        const college = await createCollege();
        const created = await postReview(student.auth, { college: college.id, rating: 4, comment });

        const found = await request(app).get(`/api/v1/reviews/${created.body.data.review._id}`);
        expect(found.status).toBe(200);
        expect(found.body.data.review.comment).toBe(comment);

        expect((await request(app).get(`/api/v1/reviews/${UNKNOWN_ID}`)).status).toBe(404);
    });
});

describe('PATCH /api/v1/reviews/:id', () => {
    async function setup() {
        const owner = await createUser('student');
        const college = await createCollege();
        const created = await postReview(owner.auth, { college: college.id, rating: 2, comment });
        return { owner, college, id: created.body.data.review._id as string };
    }

    it('lets the author change the rating and comment', async () => {
        const { owner, id } = await setup();

        const res = await request(app).patch(`/api/v1/reviews/${id}`).set('Authorization', owner.auth).send({ rating: 5, comment: 'Much better than I first thought' });

        expect(res.status).toBe(200);
        expect(res.body.data.review).toMatchObject({ rating: 5, comment: 'Much better than I first thought' });
    });

    it('does not let another student or even an admin edit it', async () => {
        const { id } = await setup();

        for (const role of ['student', 'admin']) {
            const { auth } = await createUser(role);
            const res = await request(app).patch(`/api/v1/reviews/${id}`).set('Authorization', auth).send({ rating: 5 });
            expect(res.status).toBe(403);
        }
        expect((await Review.findById(id))!.rating).toBe(2);
    });

    it('cannot move a review to another college or another author', async () => {
        const { owner, college, id } = await setup();
        const other = await createCollege();
        const someone = await createUser('student');

        await request(app).patch(`/api/v1/reviews/${id}`).set('Authorization', owner.auth).send({ rating: 3, college: other.id, user: someone.user.id });

        const review = await Review.findById(id);
        expect(review!.college.toString()).toBe(college.id);
        expect(review!.user.toString()).toBe(owner.user.id);
    });

    it('rejects an invalid rating, an empty body, a missing token and an unknown id', async () => {
        const { owner, id } = await setup();
        const patch = (path: string, body: object) => request(app).patch(path).set('Authorization', owner.auth).send(body);

        expect((await patch(`/api/v1/reviews/${id}`, { rating: 9 })).status).toBe(400);
        expect((await patch(`/api/v1/reviews/${id}`, {})).status).toBe(400);
        expect((await request(app).patch(`/api/v1/reviews/${id}`).send({ rating: 4 })).status).toBe(401);
        expect((await patch(`/api/v1/reviews/${UNKNOWN_ID}`, { rating: 4 })).status).toBe(404);
    });
});

describe('DELETE /api/v1/reviews/:id', () => {
    async function setup() {
        const owner = await createUser('student');
        const college = await createCollege();
        const created = await postReview(owner.auth, { college: college.id, rating: 2, comment });
        return { owner, id: created.body.data.review._id as string };
    }

    it('lets the author delete their own review', async () => {
        const { owner, id } = await setup();
        const res = await request(app).delete(`/api/v1/reviews/${id}`).set('Authorization', owner.auth);
        expect(res.status).toBe(204);
        expect(await Review.findById(id)).toBeNull();
    });

    it('lets an admin remove any review (moderation)', async () => {
        const { id } = await setup();
        const admin = await createUser('admin');
        const res = await request(app).delete(`/api/v1/reviews/${id}`).set('Authorization', admin.auth);
        expect(res.status).toBe(204);
    });

    it('does not let another student or a teacher delete it', async () => {
        const { id } = await setup();

        for (const role of ['student', 'teacher']) {
            const { auth } = await createUser(role);
            expect((await request(app).delete(`/api/v1/reviews/${id}`).set('Authorization', auth)).status).toBe(403);
        }
        expect(await Review.findById(id)).not.toBeNull();
    });

    it('rejects a missing token and returns 404 for an unknown id', async () => {
        const { owner, id } = await setup();
        expect((await request(app).delete(`/api/v1/reviews/${id}`)).status).toBe(401);
        expect((await request(app).delete(`/api/v1/reviews/${UNKNOWN_ID}`).set('Authorization', owner.auth)).status).toBe(404);
    });
});
