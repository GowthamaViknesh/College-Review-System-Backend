import mongoose from 'mongoose';

import logger from '../src/common/config/logger';
import { User } from '../src/models/user.model';
import { College } from '../src/models/college.model';
import { ADMIN_ROLE } from '../src/common/constants/roles';
import { deleteImage } from '../src/common/utils/image-storage';
import { createStarterRoles } from '../src/services/role.service';
import * as roleRepository from '../src/repositories/role.repository';
import { connectDatabase, disconnectDatabase } from '../src/common/config/db';

// Empties the database, keeping only the administrator accounts and the admin role they need to log in.
// Everything else goes: every other user, colleges, reviews, custom roles, the action log, logins and
// pending password resets, and the pictures those users and colleges had in image storage.
// The starter roles (teacher, student) are then put back as new, so the system is usable straight away.
//
//   npm run wipe             shows what would be deleted and deletes nothing
//   npm run wipe -- --yes    deletes it
//
// There is no undo. It acts on whatever database MONGODB_URI points at, so read the name it prints.

const confirmed = process.argv.includes('--yes');

async function wipe() {
    await connectDatabase();
    const db = mongoose.connection.db!;
    logger.info(`Database: "${db.databaseName}" on ${mongoose.connection.host}`);

    const adminRole = await roleRepository.findByName(ADMIN_ROLE);
    const admins = adminRole ? await User.find({ role: adminRole._id }).select('username email') : [];
    // Without an administrator left there would be no way back in, so nothing is touched
    if (!adminRole || admins.length === 0) throw new Error('No administrator account was found, so nothing was deleted. Run "npm run seed" first.');
    const adminIds = admins.map((admin) => admin._id);

    // What each collection loses. Anything not named here (including collections this code does not know about) is emptied.
    const keep: Record<string, object> = {
        [User.collection.name]: { _id: { $nin: adminIds } },
        [adminRole.collection.name]: { _id: { $ne: adminRole._id } },
    };
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((name) => !name.startsWith('system.'));
    const plan = [];
    for (const name of collections.sort()) {
        const filter = keep[name] ?? {};
        plan.push({ name, filter, deleting: await db.collection(name).countDocuments(filter), keeping: await db.collection(name).countDocuments({ $nor: [filter] }) });
    }

    logger.info(`Kept: ${admins.map((admin) => `${admin.username} <${admin.email}>`).join(', ')}, and the "${ADMIN_ROLE}" role`);
    for (const { name, deleting, keeping } of plan) logger.info(`  ${name.padEnd(16)} ${String(deleting).padStart(6)} to delete${keeping ? `, ${keeping} kept` : ''}`);

    if (!confirmed) {
        logger.warn('Nothing was deleted. To delete the above for good, run: npm run wipe -- --yes');
        return;
    }

    // Pictures first, while the records still say where they are stored. Does nothing if image storage is not set up.
    const withPictures = [
        ...(await User.find({ _id: { $nin: adminIds }, avatar: { $ne: null } }).select('avatar')).map((user) => user.avatar),
        ...(await College.find({ image: { $ne: null } }).select('image')).map((college) => college.image),
    ];
    for (const picture of withPictures) if (picture) await deleteImage(picture.publicId);

    for (const { name, filter } of plan) await db.collection(name).deleteMany(filter);

    // The administrators belonged to no college, but clear it in case one had been assigned by hand
    await User.updateMany({}, { college: null });
    await createStarterRoles();

    logger.info(`Done. ${plan.reduce((sum, c) => sum + c.deleting, 0)} records and ${withPictures.length} pictures deleted; starter roles recreated.`);
    logger.info('Everyone, administrators included, has been logged out and needs to log in again.');
}

wipe()
    .catch((err) => {
        logger.fatal({ err }, 'Wipe failed');
        process.exitCode = 1;
    })
    .finally(disconnectDatabase);
