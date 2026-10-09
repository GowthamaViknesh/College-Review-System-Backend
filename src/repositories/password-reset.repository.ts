import { PasswordReset } from '../models/password-reset.model';

export function findByUser(user: string) {
    return PasswordReset.findOne({ user });
}

// Sets the user's one reset code, replacing any earlier one and starting its attempts from zero
export function replaceForUser(user: string, fields: { codeHash: string; sentAt: Date; expiresAt: Date }) {
    return PasswordReset.findOneAndUpdate({ user }, { ...fields, attempts: 0, resetTokenHash: null }, { upsert: true });
}

// Counts one attempt against the user's unexpired code and returns it, in one database operation.
// Returns null when there is no code, it has run out, or it has no attempts left, so requests sent
// at the same moment cannot get more tries than the limit between them.
export function useAttempt(user: string, maxAttempts: number, now: Date) {
    return PasswordReset.findOneAndUpdate({ user, expiresAt: { $gt: now }, attempts: { $lt: maxAttempts } }, { $inc: { attempts: 1 } });
}

// What the stored code is replaced with once it has been entered correctly. No code hashes to this,
// so the same code cannot be entered a second time.
const CODE_SPENT = 'spent';

// Swaps a correctly entered code for a reset token, only if the code is still the one that was checked.
// True if this call made the swap: of two requests arriving together with the same code, one gets false.
export async function exchangeCodeForToken(user: string, codeHash: string, resetTokenHash: string, expiresAt: Date) {
    const swapped = await PasswordReset.findOneAndUpdate({ user, codeHash }, { codeHash: CODE_SPENT, resetTokenHash, expiresAt });
    return swapped !== null;
}

// Removes the reset a token belongs to and returns it, in one database operation, so a token works once
export function consumeToken(resetTokenHash: string, now: Date) {
    return PasswordReset.findOneAndDelete({ resetTokenHash, expiresAt: { $gt: now } });
}

export function deleteByUser(user: string) {
    return PasswordReset.deleteMany({ user });
}
