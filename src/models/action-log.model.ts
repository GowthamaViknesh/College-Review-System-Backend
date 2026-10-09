import { Schema, model } from 'mongoose';

import { env } from '../common/config/env';
import { IActionLog } from '../common/interfaces/action-log.interface';
import { ALL_ACTIONS, OUTCOMES, TARGET_TYPES } from '../common/constants/actions';

// A record of who did what, to what, and whether it was allowed.
// Entries are only ever added: there is no code path that edits or deletes one.
const actionLogSchema = new Schema<IActionLog>(
    {
        actor: {
            id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            username: { type: String, default: null },
        },
        action: { type: String, enum: ALL_ACTIONS, required: true },
        outcome: { type: String, enum: OUTCOMES, required: true },
        target: {
            type: { type: String, enum: [...TARGET_TYPES, null], default: null },
            id: { type: String, default: null },
        },
        details: { type: Schema.Types.Mixed, default: {} },
        ip: { type: String, default: null },
        method: { type: String, required: true },
        path: { type: String, required: true },
        statusCode: { type: Number, required: true },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        // Keep an empty details object as {} instead of dropping the field
        minimize: false,
        toJSON: {
            transform: (_doc, ret) => {
                const { __v, ...entry } = ret;
                return entry;
            },
        },
    },
);

// MongoDB removes entries by itself once they are older than the retention period (a TTL index).
// Note: changing ACTION_LOG_RETENTION_DAYS later needs the index to be dropped and rebuilt.
actionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: env.actionLogRetentionDays * 24 * 60 * 60 });

// The two most common questions: "what did this person do?" and "who did this kind of thing?"
actionLogSchema.index({ 'actor.id': 1, createdAt: -1 });
actionLogSchema.index({ action: 1, createdAt: -1 });

export const ActionLog = model<IActionLog>('ActionLog', actionLogSchema);
