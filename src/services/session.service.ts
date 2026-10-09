import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { env } from '../common/config/env';
import logger from '../common/config/logger';
import { SessionTokens } from '../common/interfaces/refresh-token.interface';
import { ApiError, signToken } from '../common/utils/utils';
import * as refreshTokenRepository from '../repositories/refresh-token.repository';
import * as userRepository from '../repositories/user.repository';

// How a login stays alive:
//  - the access token is short-lived and is what every API call carries;
//  - the refresh token is long-lived, is only ever sent to /auth/refresh, and is exchanged for a new
//    pair each time it is used. The old one stops working, so a refresh token works exactly once.
// If a refresh token that was already exchanged turns up again, someone other than the real client
// has a copy. Which of the two is the thief cannot be known, so the whole login is ended.

// Two tabs, or a request retried after a dropped connection, can legitimately send the same token
// moments apart. Within this window a repeat is treated as that, not as theft.
const REPEAT_GRACE_MS = 10_000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// The same answer whatever the reason, so a caller learns nothing about which tokens exist
const ended = () => new ApiError(401, 'Your session has ended. Please log in again.');

async function issue(userId: string, family: string): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
    await refreshTokenRepository.create({ user: userId, tokenHash: hash(refreshToken), family, expiresAt });

    return { token: signToken({ sub: userId }), refreshToken };
}

// A new login: its tokens are unrelated to any other login the same person has on another device
export function startSession(userId: string): Promise<SessionTokens> {
    return issue(userId, randomUUID());
}

export async function refreshSession(refreshToken: string): Promise<SessionTokens> {
    const now = new Date();
    const tokenHash = hash(refreshToken);

    let record = await refreshTokenRepository.claim(tokenHash, now);
    if (!record) {
        // Not claimable: unknown, expired, or already exchanged
        record = await refreshTokenRepository.findByHash(tokenHash);
        if (!record || record.expiresAt <= now) throw ended();

        const sinceUse = now.getTime() - (record.usedAt?.getTime() ?? 0);
        if (sinceUse > REPEAT_GRACE_MS) {
            await refreshTokenRepository.deleteFamily(record.family);
            logger.warn({ userId: String(record.user) }, 'A refresh token was used a second time; that login has been ended');
            throw ended();
        }
    }

    // The account may have been deleted since the token was issued
    if (!(await userRepository.existsById(String(record.user)))) {
        await refreshTokenRepository.deleteFamily(record.family);
        throw ended();
    }

    return issue(String(record.user), record.family);
}

// Logging out ends this login only; the same person's other devices stay logged in.
// Succeeds whether or not the token is known, so it is safe to call twice.
// Returns whose login was ended, or null if there was nothing to end.
export async function endSession(refreshToken: string) {
    const record = await refreshTokenRepository.findByHash(hash(refreshToken));
    if (!record) return null;

    await refreshTokenRepository.deleteFamily(record.family);
    return userRepository.findById(String(record.user));
}

// Every login the person has, on every device
export async function endAllSessions(userId: string): Promise<void> {
    await refreshTokenRepository.deleteByUser(userId);
}
