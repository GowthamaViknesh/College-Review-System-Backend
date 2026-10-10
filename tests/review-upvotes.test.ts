import request from 'supertest';
import app from '../src/app';
import { ActionLog } from '../src/models/action-log.model';
import { Review } from '../src/models/review.model';
import { createUser } from './helpers/auth';
import { createCollege } from './helpers/data';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const UNKNOWN_ID = 'Unknown0Unknown0';
const comment = 'Good faculty and placements, but the hostel needs work.';

// A review written by a new student, returned with its author
async function writeReview(collegeId?: string) {
    const author = await createUser('student');
    const college = collegeId ?? (await createCollege()).collegeId;
    const res = await request(app).post('/api/v1/reviews').set('Authorization', author.auth).send({ college, rating: 4, comment });
    return { author, review: res.body.data.review as { reviewId: string; updatedAt: string } };
}

const upvote = (auth: string, reviewId: string) => request(app).post(`/api/v1/reviews/${reviewId}/upvote`).set('Authorization', auth);
const takeBack = (auth: string, reviewId: string) => request(app).delete(`/api/v1/reviews/${reviewId}/upvote`).set('Authorization', auth);

describe('POST /api/v1/reviews/:id/upvote', () => {
    it('starts every review with no votes', async () => {
        const { review } = await writeReview();
        expect(review).toMatchObject({ votes: { count: 0, userIds: [] } });
    });

    it('lets another student upvote a review', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');

        const res = await upvote(voter.auth, review.reviewId);

        expect(res.status).toBe(200);
        expect(res.body.data.review).toMatchObject({ reviewId: review.reviewId, votes: { count: 1, userIds: [voter.user.userId] } });
    });

    it('counts each student once, however often they upvote', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');

        await upvote(voter.auth, review.reviewId);
        const again = await upvote(voter.auth, review.reviewId);

        expect(again.status).toBe(200);
        expect(again.body.data.review.votes).toEqual({ count: 1, userIds: [voter.user.userId] });
    });

    it('counts two upvotes sent at the same moment once', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');

        await Promise.all([upvote(voter.auth, review.reviewId), upvote(voter.auth, review.reviewId), upvote(voter.auth, review.reviewId)]);

        const stored = await Review.findOne({ reviewId: review.reviewId });
        expect(stored!.votes).toMatchObject({ count: 1, userIds: [voter.user.userId] });
    });

    it('adds up the votes of different students', async () => {
        const { review } = await writeReview();
        const first = await createUser('student');
        const second = await createUser('student');

        await upvote(first.auth, review.reviewId);
        const res = await upvote(second.auth, review.reviewId);

        expect(res.body.data.review.votes.count).toBe(2);
        expect(res.body.data.review.votes.userIds).toEqual([first.user.userId, second.user.userId]);
    });

    it('does not let the author upvote their own review', async () => {
        const { author, review } = await writeReview();

        const res = await upvote(author.auth, review.reviewId);

        expect(res.status).toBe(403);
        expect((await Review.findOne({ reviewId: review.reviewId }))!.votes.count).toBe(0);
    });

    it('does not let a teacher upvote, because votes come from students', async () => {
        const { review } = await writeReview();
        const teacher = await createUser('teacher');

        expect((await upvote(teacher.auth, review.reviewId)).status).toBe(403);
    });

    it('rejects a request with no token', async () => {
        const { review } = await writeReview();
        expect((await request(app).post(`/api/v1/reviews/${review.reviewId}/upvote`)).status).toBe(401);
    });

    it('answers 404 for a review that does not exist', async () => {
        const voter = await createUser('student');
        expect((await upvote(voter.auth, UNKNOWN_ID)).status).toBe(404);
    });

    it('does not mark the review as edited', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');

        const res = await upvote(voter.auth, review.reviewId);

        expect(res.body.data.review.updatedAt).toBe(review.updatedAt);
    });
});

describe('DELETE /api/v1/reviews/:id/upvote', () => {
    it('takes back an upvote', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');
        const other = await createUser('student');
        await upvote(voter.auth, review.reviewId);
        await upvote(other.auth, review.reviewId);

        const res = await takeBack(voter.auth, review.reviewId);

        expect(res.status).toBe(200);
        expect(res.body.data.review.votes).toEqual({ count: 1, userIds: [other.user.userId] });
    });

    it('changes nothing for someone who had not upvoted', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');
        const other = await createUser('student');
        await upvote(voter.auth, review.reviewId);

        const res = await takeBack(other.auth, review.reviewId);

        expect(res.status).toBe(200);
        expect(res.body.data.review.votes).toEqual({ count: 1, userIds: [voter.user.userId] });
    });

    it('answers 404 for a review that does not exist', async () => {
        const voter = await createUser('student');
        expect((await takeBack(voter.auth, UNKNOWN_ID)).status).toBe(404);
    });
});

describe('upvotes in the action log', () => {
    // Entries are written after the response has gone, so wait until the expected number has arrived
    async function logged(count: number) {
        for (let tries = 0; tries < 50; tries += 1) {
            const entries = await ActionLog.find({ action: /^review:upvote/ }).sort({ createdAt: 1, _id: 1 });
            if (entries.length >= count) return entries;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return ActionLog.find({ action: /^review:upvote/ }).sort({ createdAt: 1, _id: 1 });
    }

    it('records an upvote and taking it back, against the review', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');

        await upvote(voter.auth, review.reviewId);
        await logged(1);
        await takeBack(voter.auth, review.reviewId);

        const entries = await logged(2);
        expect(entries.map((e) => `${e.action} ${e.outcome}`)).toEqual(['review:upvote success', 'review:upvote:remove success']);
        expect(entries[0]).toMatchObject({ actor: { id: voter.user.userId }, target: { type: 'review', id: review.reviewId } });
    });

    it('records a refused upvote: your own review, or no permission', async () => {
        const { author, review } = await writeReview();
        const teacher = await createUser('teacher');

        await upvote(author.auth, review.reviewId);
        await logged(1);
        await upvote(teacher.auth, review.reviewId);

        const entries = await logged(2);
        expect(entries.map((e) => `${e.action} ${e.outcome}`)).toEqual(['review:upvote denied', 'review:upvote denied']);
        expect(entries[0]).toMatchObject({ actor: { id: author.user.userId }, details: { reason: 'You cannot upvote your own review' } });
        expect(entries[1].actor.id).toBe(teacher.user.userId);
    });

    it('leaves out clicks that changed nothing', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');
        const other = await createUser('student');

        await upvote(voter.auth, review.reviewId);
        await logged(1);
        await upvote(voter.auth, review.reviewId);
        await takeBack(other.auth, review.reviewId);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect((await logged(1)).map((e) => e.action)).toEqual(['review:upvote']);
    });
});

describe('votes elsewhere', () => {
    it('lists the most upvoted reviews first with sort=helpful', async () => {
        const college = await createCollege();
        const quiet = await writeReview(college.collegeId);
        const popular = await writeReview(college.collegeId);
        const voter = await createUser('student');
        await upvote(voter.auth, popular.review.reviewId);

        const res = await request(app).get('/api/v1/reviews').query({ college: college.collegeId, sort: 'helpful' });

        expect(res.status).toBe(200);
        expect(res.body.data.reviews.map((r: { reviewId: string }) => r.reviewId)).toEqual([popular.review.reviewId, quiet.review.reviewId]);
    });

    it('removes the votes of a deleted user', async () => {
        const { review } = await writeReview();
        const voter = await createUser('student');
        const admin = await createUser('admin');
        await upvote(voter.auth, review.reviewId);

        const deleted = await request(app).delete(`/api/v1/users/${voter.user.userId}`).set('Authorization', admin.auth);

        expect(deleted.status).toBeLessThan(300);
        expect((await Review.findOne({ reviewId: review.reviewId }))!.votes).toMatchObject({ count: 0, userIds: [] });
    });
});
