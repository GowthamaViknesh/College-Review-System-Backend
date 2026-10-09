import { PasswordReset } from '../models/password-reset.model';

export function findByUser(user: string) {
    return PasswordReset.findOne({ user });
}

// Sets the user's one reset code, replacing any earlier one and starting its attempts from zero
export function replaceForUser(user: string, fields: { codeHash: string; sentAt: Date; expiresAt: Date }) {
    return PasswordReset.findOneAndUpdate({ user }, { ...fields, attempts: 0 }, { upsert: true });
}

// Counts one attempt against the user's unexpired code and returns it, in one database operation.
// Returns null when there is no code, it has run out, or it has no attempts left, so requests sent
// at the same moment cannot get more tries than the limit between them.
export function useAttempt(user: string, maxAttempts: number, now: Date) {
    return PasswordReset.findOneAndUpdate({ user, expiresAt: { $gt: now }, attempts: { $lt: maxAttempts } }, { $inc: { attempts: 1 } });
}

// Removes the code only if it is still the one that was checked; true if this call removed it
export async function consume(user: string, codeHash: string) {
    const removed = await PasswordReset.findOneAndDelete({ user, codeHash });
    return removed !== null;
}

export function deleteByUser(user: string) {
    return PasswordReset.deleteMany({ user });
}
