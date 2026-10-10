import { Schema, model } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { IRefreshToken } from '../common/interfaces/refresh-token.interface';

const refreshTokenSchema = new Schema<IRefreshToken>(
    {
        refreshTokenId: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            immutable: true,
            trim: true,
            default: () => generatePublicId(),
        },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        family: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
