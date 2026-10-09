import request from 'supertest';
import app from '../src/app';
import { College } from '../src/models/college.model';
import { Review } from '../src/models/review.model';
import { createUser } from './helpers/auth';
import { createCollege, rateCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const UNKNOWN_ID = 'Unknown0Unknown0';
const newCollege = { name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu', description: 'Public state university' };
const names = (res: request.Response) => res.body.data.colleges.map((c: { name: string }) => c.name);

describe('average rating and review count', () => {
    it('are calculated from the reviews of each college', async () => {
        const a = await createCollege({ name: 'A' });
        const b = await createCollege({ name: 'B' });
        await rateCollege(a.id, [5, 4, 4]); // mean 4.333...
        await rateCollege(b.id, [2]);

        const res = await request(app).get('/api/v1/colleges?sort=name');

        expect(res.status).toBe(200);
        expect(res.body.data.colleges).toEqual([
            expect.objectContaining({ name: 'A', averageRating: 4.3, reviewCount: 3 }),
            expect.objectContaining({ name: 'B', averageRating: 2, reviewCount: 1 }),
        ]);
    });

    it('are null and 0 for a college nobody has reviewed', async () => {
        const college = await createCollege();

        const list = await request(app).get('/api/v1/colleges');
        expect(list.body.data.colleges[0]).toMatchObject({ averageRating: null, reviewCount: 0 });

        const one = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(one.body.data.college).toMatchObject({ averageRating: null, reviewCount: 0 });
    });

    it('rounds the average to one decimal place', async () => {
        const college = await createCollege();
        await rateCollege(college.id, [5, 5, 4]); // 4.666... -> 4.7

        const res = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(res.body.data.college.averageRating).toBe(4.7);
    });

    it.each([
        { ratings: [4, 4, 5, 4], expected: 4.3 }, // 4.25
        { ratings: [4, 5, 5, 5], expected: 4.8 }, // 4.75
        { ratings: [1, 2], expected: 1.5 },
        { ratings: [5, 5], expected: 5 },
    ])('rounds a trailing 5 upwards: $ratings -> $expected', async ({ ratings, expected }) => {
        const college = await createCollege();
        await rateCollege(college.id, ratings);

        const res = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(res.body.data.college.averageRating).toBe(expected);
    });

    it('change as soon as a review is added, edited or deleted', async () => {
        const college = await createCollege();
        const student = await createUser('student');
        const other = await createUser('student');
        const stats = async () => {
            const { averageRating, reviewCount } = (await request(app).get(`/api/v1/colleges/${college.collegeId}`)).body.data.college;
            return { averageRating, reviewCount };
        };

        const created = await request(app)
            .post('/api/v1/reviews')
            .set('Authorization', student.auth)
            .send({ college: college.collegeId, rating: 2, comment: 'Not what I expected at all' });
        expect(await stats()).toEqual({ averageRating: 2, reviewCount: 1 });

        await request(app).post('/api/v1/reviews').set('Authorization', other.auth).send({ college: college.collegeId, rating: 5, comment: 'Excellent in every way' });
        expect(await stats()).toEqual({ averageRating: 3.5, reviewCount: 2 });

        await request(app).patch(`/api/v1/reviews/${created.body.data.review.reviewId}`).set('Authorization', student.auth).send({ rating: 4 });
        expect(await stats()).toEqual({ averageRating: 4.5, reviewCount: 2 });

        await request(app).delete(`/api/v1/reviews/${created.body.data.review.reviewId}`).set('Authorization', student.auth);
        expect(await stats()).toEqual({ averageRating: 5, reviewCount: 1 });
    });

    it('stop counting a user once their account is deleted', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        const leaving = await createUser('student');
        await Review.create({ college: college.id, user: leaving.user.id, rating: 1, comment: 'Leaving a one star review' });
        await rateCollege(college.id, [5]);

        await request(app).delete(`/api/v1/users/${leaving.user.userId}`).set('Authorization', admin.auth);

        const res = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(res.body.data.college).toMatchObject({ averageRating: 5, reviewCount: 1 });
    });
});

describe('GET /api/v1/colleges', () => {
    it('is public and paginated', async () => {
        for (const name of ['A', 'B', 'C']) await createCollege({ name });

        const res = await request(app).get('/api/v1/colleges?limit=2&sort=name');

        expect(res.status).toBe(200);
        expect(names(res)).toEqual(['A', 'B']);
        expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

        const second = await request(app).get('/api/v1/colleges?limit=2&page=2&sort=name');
        expect(names(second)).toEqual(['C']);
    });

    it('sorts by rating and by number of reviews, with unrated colleges last', async () => {
        const good = await createCollege({ name: 'Good' });
        const popular = await createCollege({ name: 'Popular' });
        await createCollege({ name: 'Unrated' });
        await rateCollege(good.id, [5]);
        await rateCollege(popular.id, [3, 3, 3]);

        expect(names(await request(app).get('/api/v1/colleges?sort=rating'))).toEqual(['Good', 'Popular', 'Unrated']);
        expect(names(await request(app).get('/api/v1/colleges?sort=reviews'))).toEqual(['Popular', 'Good', 'Unrated']);
    });

    it('filters by minimum average rating and reports the filtered total', async () => {
        const good = await createCollege({ name: 'Good' });
        const poor = await createCollege({ name: 'Poor' });
        await createCollege({ name: 'Unrated' });
        await rateCollege(good.id, [5, 4]);
        await rateCollege(poor.id, [2]);

        const res = await request(app).get('/api/v1/colleges?minRating=4');

        expect(names(res)).toEqual(['Good']);
        expect(res.body.meta.total).toBe(1);
    });

    it('searches by name, city or description and filters by city and state', async () => {
        await createCollege({ name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu' });
        await createCollege({ name: 'PSG Tech', city: 'Coimbatore', state: 'Tamil Nadu', description: 'Known for engineering' });
        await createCollege({ name: 'IISc', city: 'Bengaluru', state: 'Karnataka' });

        expect(names(await request(app).get('/api/v1/colleges?search=ANNA'))).toEqual(['Anna University']);
        expect(names(await request(app).get('/api/v1/colleges?search=engineering'))).toEqual(['PSG Tech']);
        expect(names(await request(app).get('/api/v1/colleges?city=bengaluru'))).toEqual(['IISc']);
        expect(names(await request(app).get('/api/v1/colleges?state=Tamil%20Nadu&sort=name'))).toEqual(['Anna University', 'PSG Tech']);
        expect(names(await request(app).get('/api/v1/colleges?search=.*'))).toEqual([]);
    });

    it('rejects invalid query values', async () => {
        const res = await request(app).get('/api/v1/colleges?sort=random&minRating=9&limit=0');
        expect(res.status).toBe(400);
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['limit', 'minRating', 'sort']);
    });
});

describe('GET /api/v1/colleges/:id', () => {
    it('is public, and returns 404 for an unknown id and 400 for a malformed id', async () => {
        const college = await createCollege({ name: 'Anna University' });

        const found = await request(app).get(`/api/v1/colleges/${college.collegeId}`);
        expect(found.status).toBe(200);
        expect(found.body.data.college.name).toBe('Anna University');
        expect(found.body.data.college).not.toHaveProperty('__v');

        expect((await request(app).get(`/api/v1/colleges/${UNKNOWN_ID}`)).status).toBe(404);
        expect((await request(app).get('/api/v1/colleges/nope')).status).toBe(400);
    });
});

describe('POST /api/v1/colleges', () => {
    it.each(['admin', 'teacher'])('lets a %s add a college', async (role) => {
        const actor = await createUser(role);
        const res = await request(app).post('/api/v1/colleges').set('Authorization', actor.auth).send(newCollege);

        expect(res.status).toBe(201);
        expect(res.body.data.college).toMatchObject({ ...newCollege, createdBy: actor.user.userId, averageRating: null, reviewCount: 0 });
    });

    it('forbids a student and rejects a request with no token', async () => {
        const student = await createUser('student');
        expect((await request(app).post('/api/v1/colleges').set('Authorization', student.auth).send(newCollege)).status).toBe(403);
        expect((await request(app).post('/api/v1/colleges').send(newCollege)).status).toBe(401);
        expect(await College.countDocuments()).toBe(0);
    });

    it('rejects a duplicate name regardless of case', async () => {
        const teacher = await createUser('teacher');
        await request(app).post('/api/v1/colleges').set('Authorization', teacher.auth).send(newCollege);

        const res = await request(app)
            .post('/api/v1/colleges')
            .set('Authorization', teacher.auth)
            .send({ ...newCollege, name: 'ANNA UNIVERSITY' });

        expect(res.status).toBe(409);
    });

    it('returns field-level errors for invalid input', async () => {
        const teacher = await createUser('teacher');
        const res = await request(app).post('/api/v1/colleges').set('Authorization', teacher.auth).send({ name: 'A' });
        expect(res.status).toBe(400);
        expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['city', 'name', 'state']);
    });
});

describe('PATCH /api/v1/colleges/:id', () => {
    it('lets a teacher edit a college and keeps its rating', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege({ name: 'Old Name' });
        await rateCollege(college.id, [4]);

        const res = await request(app).patch(`/api/v1/colleges/${college.collegeId}`).set('Authorization', teacher.auth).send({ name: 'New Name', city: 'Madurai' });

        expect(res.status).toBe(200);
        expect(res.body.data.college).toMatchObject({ name: 'New Name', city: 'Madurai', state: 'Tamil Nadu', averageRating: 4, reviewCount: 1 });
    });

    it('allows saving a college under its own name but not under another college name', async () => {
        const teacher = await createUser('teacher');
        const college = await createCollege({ name: 'Anna University' });
        await createCollege({ name: 'PSG Tech' });
        const patch = (body: object) => request(app).patch(`/api/v1/colleges/${college.collegeId}`).set('Authorization', teacher.auth).send(body);

        expect((await patch({ name: 'anna university', description: 'Updated' })).status).toBe(200);
        expect((await patch({ name: 'psg tech' })).status).toBe(409);
    });

    it('forbids a student, and handles an empty body and an unknown id', async () => {
        const teacher = await createUser('teacher');
        const student = await createUser('student');
        const college = await createCollege();

        expect((await request(app).patch(`/api/v1/colleges/${college.collegeId}`).set('Authorization', student.auth).send({ city: 'X1' })).status).toBe(403);
        expect((await request(app).patch(`/api/v1/colleges/${college.collegeId}`).set('Authorization', teacher.auth).send({})).status).toBe(400);
        expect((await request(app).patch(`/api/v1/colleges/${UNKNOWN_ID}`).set('Authorization', teacher.auth).send({ city: 'Madurai' })).status).toBe(404);
    });
});

describe('DELETE /api/v1/colleges/:id', () => {
    it('lets an admin delete a college together with its reviews, leaving other colleges alone', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();
        const other = await createCollege();
        await rateCollege(college.id, [5, 4]);
        await rateCollege(other.id, [3]);

        const res = await request(app).delete(`/api/v1/colleges/${college.collegeId}`).set('Authorization', admin.auth);

        expect(res.status).toBe(204);
        expect(await College.findById(college.id)).toBeNull();
        expect(await Review.countDocuments({ college: college.id })).toBe(0);
        expect(await Review.countDocuments({ college: other.id })).toBe(1);
    });

    it('forbids a teacher and a student, and returns 404 for an unknown id', async () => {
        const admin = await createUser('admin');
        const college = await createCollege();

        for (const role of ['teacher', 'student']) {
            const { auth } = await createUser(role);
            expect((await request(app).delete(`/api/v1/colleges/${college.collegeId}`).set('Authorization', auth)).status).toBe(403);
        }
        expect((await request(app).delete(`/api/v1/colleges/${UNKNOWN_ID}`).set('Authorization', admin.auth)).status).toBe(404);
        expect(await College.findById(college.id)).not.toBeNull();
    });
});
