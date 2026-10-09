import { Types } from 'mongoose';
import { College } from '../../src/models/college.model';

// A college to put new accounts in, made fresh for each test. It is created directly (with no real
// creator), so it adds no users to the database for tests that count them.
let collegeId = '';
// The same college by MongoDB's id, for tests that place an account in it directly in the database
let collegeDbId = '';

export async function createHomeCollege() {
    const college = await College.create({ name: 'Home College', country: 'India', state: 'Tamil Nadu', city: 'Chennai', description: '', createdBy: new Types.ObjectId() });
    collegeId = college.collegeId;
    collegeDbId = college.id;
    return college;
}

// Adds the home college to the body of a register or create-user request, unless the body names its own
export const inCollege = <T extends object>(body: T) => ({ college: collegeId, ...body });
export const homeCollegeId = () => collegeId;
export const homeCollegeDbId = () => collegeDbId;
