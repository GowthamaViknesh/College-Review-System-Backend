import type { Model } from 'mongoose';

import logger from '../common/config/logger';
import { generatePublicId } from '../common/utils/utils';
import { ActionLog } from '../models/action-log.model';
import { College } from '../models/college.model';
import { PasswordReset } from '../models/password-reset.model';
import { RefreshToken } from '../models/refresh-token.model';
import { Review } from '../models/review.model';
import { Role } from '../models/role.model';
import { User } from '../models/user.model';

const PUBLIC_IDS: [model: Model<any>, field: string][] = [
    [User, 'userId'],
    [Role, 'roleId'],
    [College, 'collegeId'],
    [Review, 'reviewId'],
    [ActionLog, 'logId'],
    [RefreshToken, 'refreshTokenId'],
    [PasswordReset, 'passwordResetId'],
];

const BATCH = 500;

// Gives a public id to every record that does not have one: anything created before public ids
// existed, or written straight into the database. Runs at every startup. It only ever touches
// records where the field is missing, so once everything has an id it does nothing, and an id that
// has been handed out is never changed.
export async function backfillPublicIds(): Promise<Record<string, number>> {
    const filled: Record<string, number> = {};

    for (const [model, field] of PUBLIC_IDS) {
        // The driver is used directly: these are plain "set one missing field" writes, and going through
        // the model would also bump updatedAt, which would be a lie about when the record last changed
        const collection = model.collection;
        let count = 0;

        for (;;) {
            const missing = await collection
                .find({ [field]: { $exists: false } }, { projection: { _id: 1 } })
                .limit(BATCH)
                .toArray();
            if (!missing.length) break;

            // The filter repeats "still missing", so if another server instance is doing the same work
            // at the same moment, whichever write lands first wins and the other changes nothing
            await collection.bulkWrite(
                missing.map(({ _id }) => ({ updateOne: { filter: { _id, [field]: { $exists: false } }, update: { $set: { [field]: generatePublicId() } } } })),
            );
            count += missing.length;
        }

        if (count) {
            filled[field] = count;
            logger.info(`Gave ${count} existing ${collection.collectionName} a ${field}`);
        }
    }
    return filled;
}

// Older action log entries name the people and things involved by MongoDB's id. This rewrites those
// to public ids, so the whole log reads the same way and can be filtered by the ids the API uses.
// Entries about records that have since been deleted cannot be matched and are left as they are.
// A one-off, run by `npm run migrate:ids`, not at startup.
export async function convertActionLogIds(): Promise<number> {
    const publicIdOf = new Map<string, string>();
    for (const [model, field] of PUBLIC_IDS.slice(0, 4)) {
        const rows = await model.collection.find({}, { projection: { [field]: 1 } }).toArray();
        for (const row of rows) if (row[field]) publicIdOf.set(String(row._id), row[field]);
    }

    const logs = ActionLog.collection;
    let changed = 0;
    for (const path of ['actor.id', 'target.id']) {
        // Old ids are 12-byte ObjectIds, or their 24-character text form
        const oldIds = await logs.distinct(path, { $or: [{ [path]: { $type: 'objectId' } }, { [path]: /^[0-9a-f]{24}$/ }] });
        for (const oldId of oldIds) {
            const publicId = publicIdOf.get(String(oldId));
            if (!publicId) continue;
            const result = await logs.updateMany({ [path]: oldId }, { $set: { [path]: publicId } });
            changed += result.modifiedCount;
        }
    }
    if (changed) logger.info(`Rewrote ${changed} ids in older action log entries`);
    return changed;
}
