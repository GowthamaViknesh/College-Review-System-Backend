import { connectDatabase, disconnectDatabase } from '../src/common/config/db';
import logger from '../src/common/config/logger';
import { User } from '../src/models/user.model';
import { convertActionLogIds } from '../src/services/public-id.service';

// One-off, for a database that was in use before public ids existed. Safe to run more than once.
//   npm run migrate:ids
// Connecting already gives every record that lacks one a public id (the server does the same at each
// startup). What this adds is rewriting the ids inside older action log entries, and a summary.
async function main() {
    await connectDatabase();
    await convertActionLogIds();

    const users = await User.find().select('userId username email').sort({ createdAt: 1 }).lean();
    logger.info(`Every record now has a public id. Users (${users.length}):`);
    for (const user of users) logger.info(`  ${user.userId}  ${user.username} <${user.email}>`);
}

main()
    .catch((err) => {
        logger.error({ err }, 'Migration failed');
        process.exitCode = 1;
    })
    .finally(disconnectDatabase);
