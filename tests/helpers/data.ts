import { College } from '../../src/models/college.model';
import { Review } from '../../src/models/review.model';
import { createUser } from './auth';

let counter = 0;

// Creates a college directly in the DB
export async function createCollege(overrides: Record<string, string> = {}) {
    counter += 1;
    const creator = overrides.createdBy ?? (await createUser('teacher')).user.id;
    return College.create({ name: `College ${counter}`, country: 'India', state: 'Tamil Nadu', city: 'Chennai', description: '', createdBy: creator, ...overrides });
}

// Gives a college one review per rating, each from a different new student
export async function rateCollege(collegeId: string, ratings: number[]) {
    for (const rating of ratings) {
        const { user } = await createUser('student');
        await Review.create({ college: collegeId, user: user.id, rating, comment: `A ${rating} star review of this college` });
    }
}
