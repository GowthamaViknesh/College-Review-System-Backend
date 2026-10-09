import logger from '../src/common/config/logger';
import { User } from '../src/models/user.model';
import { Review } from '../src/models/review.model';
import { College } from '../src/models/college.model';
import { ADMIN_ROLE, DEFAULT_ROLE } from '../src/common/constants/roles';
import { createStarterRoles } from '../src/services/role.service';
import * as roleRepository from '../src/repositories/role.repository';
import { connectDatabase, disconnectDatabase } from '../src/common/config/db';

// Optional sample data for trying the API: a few colleges, students and reviews.
// Run `npm run seed` first (it creates the admin); this script only adds to an empty colleges collection.
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Password@123';

const COLLEGES = [
    { name: 'Anna University', city: 'Chennai', state: 'Tamil Nadu', description: 'Public state university known for engineering' },
    { name: 'PSG College of Technology', city: 'Coimbatore', state: 'Tamil Nadu', description: 'Autonomous engineering college' },
    { name: 'Indian Institute of Science', city: 'Bengaluru', state: 'Karnataka', description: 'Research university for science and engineering' },
    { name: 'Loyola College', city: 'Chennai', state: 'Tamil Nadu', description: 'Arts and science college' },
    { name: 'National Institute of Technology', city: 'Tiruchirappalli', state: 'Tamil Nadu', description: 'Institute of national importance' },
];

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

    if (await College.exists({})) {
        logger.info('Colleges already exist, demo data left unchanged');
        return disconnectDatabase();
    }

    const admin = await User.findOne({ role: (await roleRepository.findByName(ADMIN_ROLE))!._id });
    if (!admin) throw new Error('No admin user found. Run "npm run seed" first.');
    const studentRole = (await roleRepository.findByName(DEFAULT_ROLE))!;

    const students = [];
    for (const username of STUDENTS) {
        const email = `${username}@example.com`;
        students.push((await User.findOne({ email })) ?? (await User.create({ username, email, password: PASSWORD, role: studentRole._id })));
    }

    const colleges = await College.insertMany(COLLEGES.map((college) => ({ ...college, createdBy: admin._id })));

    const reviews = RATINGS.flatMap((row, c) =>
        row.flatMap((rating, s) => (rating ? [{ college: colleges[c]._id, user: students[s]._id, rating, comment: COMMENTS[rating] }] : [])),
    );
    await Review.insertMany(reviews);

    logger.info(`Created ${colleges.length} colleges, ${students.length} students (password ${PASSWORD}) and ${reviews.length} reviews`);
    await disconnectDatabase();
}

seedDemo().catch((err) => {
    logger.fatal({ err }, 'Demo seeding failed');
    process.exit(1);
});
