import { Schema, model, type Types } from 'mongoose';
import { generatePublicId } from '../common/utils/utils';
import { IPasswordReset } from '../common/interfaces/user.interface';

const passwordResetSchema = new Schema<IPasswordReset>({
    passwordResetId: {
        type: String,
        required: true,
        unique: true,
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

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);
