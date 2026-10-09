import { Schema, model } from 'mongoose';

import { IRefreshToken } from '../common/interfaces/refresh-token.interface';

// One row per refresh token ever issued and not yet expired. A token that has been exchanged is kept
// (with usedAt set) until it expires, which is how a second use of it is recognised.
const refreshTokenSchema = new Schema<IRefreshToken>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        family: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes each row by itself once its expiry time has passed (a TTL index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
