import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { endAllSessions } from './session.service';

import { env } from '../common/config/env';
import logger from '../common/config/logger';
import { ApiError, validationError } from '../common/utils/utils';
import { isMailConfigured, sendPasswordResetEmail } from '../common/utils/mailer';

import * as userRepository from '../repositories/user.repository';
import * as passwordResetRepository from '../repositories/password-reset.repository';

export const RESET_CODE_MINUTES = 10;
export const RESET_MAX_ATTEMPTS = 5;
export const RESET_RESEND_SECONDS = 60;
export const RESET_TOKEN_MINUTES = 10;

const hashCode = (userId: string, code: string) => createHmac('sha256', env.jwtSecret).update(`${userId}:${code}`).digest('hex');

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const invalidCode = () => validationError('code', 'That code is wrong or has expired. Check it, or ask for a new one.');

export async function requestPasswordReset(email: string) {
    if (!isMailConfigured() && env.nodeEnv !== 'development' && !env.isTest) {
        throw new ApiError(503, 'Password reset by email is not set up on this server');
    }

    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) return null;

    const now = new Date();
    const previous = await passwordResetRepository.findByUser(user.id);
    if (previous && now.getTime() - previous.sentAt.getTime() < RESET_RESEND_SECONDS * 1000) return null;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await passwordResetRepository.replaceForUser(user.id, {
        codeHash: hashCode(user.id, code),
        sentAt: now,
        expiresAt: new Date(now.getTime() + RESET_CODE_MINUTES * 60 * 1000),
    });

    if (!isMailConfigured()) {
        logger.warn(`Email is not set up, so the password reset code for ${user.email} is shown here instead: ${code}`);
        return user;
    }

    sendPasswordResetEmail({ to: user.email, name: user.username, code, minutes: RESET_CODE_MINUTES }).catch((err) => {
        logger.error({ err }, 'Password reset email could not be sent');
    });
    return user;
}

export async function verifyResetCode(email: string, code: string) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) throw invalidCode();

    const reset = await passwordResetRepository.useAttempt(user.id, RESET_MAX_ATTEMPTS, new Date());
    if (!reset) throw invalidCode();

    const codeHash = hashCode(user.id, code);
    if (!sameHash(reset.codeHash, codeHash)) throw invalidCode();

    const resetToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);
    if (!(await passwordResetRepository.exchangeCodeForToken(user.id, codeHash, hashToken(resetToken), expiresAt))) throw invalidCode();

    return { resetToken, expiresInMinutes: RESET_TOKEN_MINUTES };
}

export async function resetPassword(resetToken: string, newPassword: string) {
    const expired = () => validationError('resetToken', 'This password reset has expired or was already used. Ask for a new code.');

    const reset = await passwordResetRepository.consumeToken(hashToken(resetToken), new Date());
    if (!reset) throw expired();

    const user = await userRepository.findByIdWithPassword(String(reset.user));
    if (!user) throw expired();

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    await endAllSessions(user.id);
    return user;
}
