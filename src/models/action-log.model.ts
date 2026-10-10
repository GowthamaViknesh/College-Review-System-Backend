import { Schema, model } from 'mongoose';

import { env } from '../common/config/env';
import { generatePublicId } from '../common/utils/utils';
import { IActionLog } from '../common/interfaces/action-log.interface';
import { ALL_ACTIONS, OUTCOMES, TARGET_TYPES } from '../common/constants/actions';

const actionLogSchema = new Schema<IActionLog>(
    {
        logId: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            immutable: true,
            trim: true,
            default: () => generatePublicId(),
        },
        actor: {
            id: { type: String, default: null },
            username: { type: String, default: null },
        },

        action: {
            type: String,
            enum: ALL_ACTIONS,
            required: true
        },

        outcome: {
            type: String,
            enum: OUTCOMES,
            required: true
        },

        target: {
            type: {
                type: String,
                enum: [...TARGET_TYPES, null],
                default: null
            },
            id: {
                type: String,
                default: null
            },
        },

        details: {
            type: Schema.Types.Mixed,
            default: {}
        },

        ip: {
            type: String,
            default: null
        },

        method: {
            type: String,
            required: true
        },

        path: {
            type: String,
            required: true
        },

        statusCode: {
            type: Number,
            required: true
        },
    },
    {
        timestamps: {
            createdAt: true,
            updatedAt: false
        },
        minimize: false,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, __v, ...entry } = ret;
                return entry;
            },
        },
    },
);

actionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: env.actionLogRetentionDays * 24 * 60 * 60 });
actionLogSchema.index({ 'actor.id': 1, createdAt: -1 });
actionLogSchema.index({ action: 1, createdAt: -1 });

export const ActionLog = model<IActionLog>('ActionLog', actionLogSchema);
