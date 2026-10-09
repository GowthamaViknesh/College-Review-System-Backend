import logger from '../src/common/config/logger';
import { User } from '../src/models/user.model';
import { Review } from '../src/models/review.model';
import { College } from '../src/models/college.model';
import { ADMIN_ROLE, DEFAULT_ROLE } from '../src/common/constants/roles';
import { createStarterRoles } from '../src/services/role.service';
import * as roleRepository from '../src/repositories/role.repository';
import { connectDatabase, disconnectDatabase } from '../src/common/config/db';

// Optional sample data for trying the API: a teacher, a few students, colleges and reviews.
// Run `npm run seed` first (it creates the admin). Safe to run again: accounts that exist are kept,
// and colleges and reviews are only added when there are no colleges yet.
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Password@123';

const COLLEGES = [
    { name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu', description: 'Public state university known for engineering' },
    { name: 'PSG College of Technology', city: 'Coimbatore', state: 'Tamil Nadu', description: 'Autonomous engineering college' },
    { name: 'Indian Institute of Science', city: 'Bengaluru', state: 'Karnataka', description: 'Research university for science and engineering' },
    { name: 'Loyola College', city: 'Chennai', state: 'Tamil Nadu', description: 'Arts and science college' },
    { name: 'National Institute of Technology', city: 'Tiruchirappalli', state: 'Tamil Nadu', description: 'Institute of national importance' },
];

const TEACHER = 'teacher';
const STUDENTS = ['arun', 'priya', 'karthik', 'divya', 'vignesh'];

// One row per college, one rating per student; 0 means that student did not review that college.
// The last college is left without reviews to show how an unrated college appears.
const RATINGS = [
    [5, 4, 4, 5, 3],
    [4, 4, 0, 5, 4],
    [5, 5, 5, 0, 4],
    [3, 0, 2, 4, 0],
    [0, 0, 0, 0, 0],
];

const COMMENTS: Record<number, string> = {
    5: 'Excellent faculty, strong placements and a great campus.',
    4: 'Very good overall, with a few facilities that could be better.',
    3: 'Decent teaching, but the infrastructure is showing its age.',
    2: 'Below what I expected; labs and hostels need serious work.',
    1: 'Would not recommend based on my experience.',
};

async function seedDemo() {
    await connectDatabase();
    await createStarterRoles();

    const admin = await User.findOne({ role: (await roleRepository.findByName(ADMIN_ROLE))!._id });
    if (!admin) throw new Error('No admin user found. Run "npm run seed" first.');
    const studentRole = (await roleRepository.findByName(DEFAULT_ROLE))!;
    const teacherRole = (await roleRepository.findByName(TEACHER))!;

    // An existing account is kept as it is; a missing one is created
    const ensureUser = async (username: string, role: { _id: unknown }) => {
        const email = `${username}@example.com`;
        return (await User.findOne({ email })) ?? (await User.create({ username, email, password: PASSWORD, role: role._id }));
    };

    await ensureUser(TEACHER, teacherRole);
    const students = [];
    for (const username of STUDENTS) students.push(await ensureUser(username, studentRole));
    logger.info(`Accounts ready: ${TEACHER}@example.com and ${students.length} students (password ${PASSWORD})`);

    if (await College.exists({})) {
        logger.info('Colleges already exist, so no colleges or reviews were added');
        return disconnectDatabase();
    }

    const colleges = await College.insertMany(COLLEGES.map((college) => ({ ...college, createdBy: admin._id })));

    // Dated across the last 7 days (rather than all "now") so the dashboard's activity chart has a shape
    const DAY_MS = 24 * 60 * 60 * 1000;
    const reviews = RATINGS.flatMap((row, c) =>
        row.flatMap((rating, s) => (rating ? [{ college: colleges[c]._id, user: students[s]._id, rating, comment: COMMENTS[rating] }] : [])),
    ).map((review, i) => {
        const writtenAt = new Date(Date.now() - ((i * 3) % 7) * DAY_MS);
        return { ...review, createdAt: writtenAt, updatedAt: writtenAt };
    });
    await Review.insertMany(reviews);

    logger.info(`Created ${colleges.length} colleges and ${reviews.length} reviews`);
    await disconnectDatabase();
}

seedDemo().catch((err) => {
    logger.fatal({ err }, 'Demo seeding failed');
    process.exit(1);
});
