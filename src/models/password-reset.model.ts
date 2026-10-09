import { Schema, model, type Types } from 'mongoose';

export interface IPasswordReset {
    user: Types.ObjectId;
    // A keyed hash of the emailed code. The code itself is never stored.
    codeHash: string;
    // How many times a code has been tried against this request, right or wrong
    attempts: number;
    sentAt: Date;
    expiresAt: Date;
}

// At most one row per user: the reset code they were last sent, until it is used or runs out
const passwordResetSchema = new Schema<IPasswordReset>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
});

// MongoDB removes each row by itself once its expiry time has passed (a TTL index)
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);
