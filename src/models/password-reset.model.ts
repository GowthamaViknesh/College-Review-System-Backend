import { Schema, model, type Types } from 'mongoose';

import { generatePublicId } from '../common/utils/public-id';

export interface IPasswordReset {
    passwordResetId: string;
    user: Types.ObjectId;
    // A keyed hash of the emailed code. The code itself is never stored.
    codeHash: string;
    // How many times a code has been tried against this request, right or wrong
    attempts: number;
    // Set once the code has been entered correctly: a hash of the one-time token that allows the
    // password to be set. null until then.
    resetTokenHash: string | null;
    sentAt: Date;
    expiresAt: Date;
}

// At most one row per user: the reset they last started. It holds the emailed code until that is
// entered correctly, then the token that lets them choose a new password, until that is used or runs out.
const passwordResetSchema = new Schema<IPasswordReset>({
    // The id the API uses for this record. Created with it, and never changed afterwards.
    passwordResetId: {
        type: String,
        required: true,
        unique: true,
        // Records with no id yet are left out of the unique index instead of colliding on "missing"
        sparse: true,
        immutable: true,
        trim: true,
        default: () => generatePublicId(),
    },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    resetTokenHash: { type: String, default: null, index: true },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
});

// MongoDB removes each row by itself once its expiry time has passed (a TTL index)
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);
