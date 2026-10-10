import { PasswordReset } from '../models/password-reset.model';

export function findByUser(user: string) {
    return PasswordReset.findOne({ user });
}

export function replaceForUser(user: string, fields: { codeHash: string; sentAt: Date; expiresAt: Date }) {
    return PasswordReset.findOneAndUpdate({ user }, { ...fields, attempts: 0, resetTokenHash: null }, { upsert: true });
}

export function useAttempt(user: string, maxAttempts: number, now: Date) {
    return PasswordReset.findOneAndUpdate({ user, expiresAt: { $gt: now }, attempts: { $lt: maxAttempts } }, { $inc: { attempts: 1 } });
}

export async function exchangeCodeForToken(user: string, codeHash: string, resetTokenHash: string, expiresAt: Date) {
    const swapped = await PasswordReset.findOneAndUpdate({ user, codeHash }, { codeHash: 'spent', resetTokenHash, expiresAt });
    return swapped !== null;
}

export function consumeToken(resetTokenHash: string, now: Date) {
    return PasswordReset.findOneAndDelete({ resetTokenHash, expiresAt: { $gt: now } });
}

export function deleteByUser(user: string) {
    return PasswordReset.deleteMany({ user });
}
