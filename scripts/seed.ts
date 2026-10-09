import logger from '../src/common/config/logger';
import { User } from '../src/models/user.model';
import { ADMIN_ROLE } from '../src/common/constants/roles';
import { createStarterRoles } from '../src/services/role.service';
import * as roleRepository from '../src/repositories/role.repository';
import { connectDatabase, disconnectDatabase } from '../src/common/config/db';

// The first admin account. Everything else (more users, more roles) is created through the API by this user.
// Set these in .env before seeding a real environment; the defaults are for local development only.
const ADMIN = {
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Password@123',
};

async function seed() {
    // Connecting also makes sure the admin role exists with every permission
    await connectDatabase();

    await createStarterRoles();
    logger.info('Starter roles ready (teacher, student)');

    if (await User.exists({ email: ADMIN.email })) {
        logger.info(`Admin ${ADMIN.email} already exists, left unchanged`);
    } else {
        const adminRole = await roleRepository.findByName(ADMIN_ROLE);
        await User.create({ ...ADMIN, role: adminRole!._id });
        logger.info(`Created admin: ${ADMIN.email} / ${ADMIN.password}`);
    }

    await disconnectDatabase();
}

seed().catch((err) => {
    logger.fatal({ err }, 'Seeding failed');
    process.exit(1);
});
