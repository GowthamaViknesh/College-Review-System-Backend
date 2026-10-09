import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { env } from '../common/config/env';
import logger from '../common/config/logger';
import { isMailConfigured, sendPasswordResetEmail } from '../common/utils/mailer';
import { ApiError, validationError } from '../common/utils/utils';
import * as passwordResetRepository from '../repositories/password-reset.repository';
import * as userRepository from '../repositories/user.repository';
import { endAllSessions } from './session.service';

// Forgotten password: a 6-digit code is emailed to the account's address, and whoever can read that
// inbox may set a new password with it. Six digits is only a million possibilities, so everything
// here exists to make guessing hopeless: the code is short-lived, can be tried a handful of times,
// works once, and is replaced whenever a new one is asked for.

export const RESET_CODE_MINUTES = 10;
export const RESET_MAX_ATTEMPTS = 5;
// One email a minute per account, so the form cannot be used to flood someone's inbox
export const RESET_RESEND_SECONDS = 60;

// Keyed with the server's secret and tied to the user, so the stored value is useless to anyone who
// obtains the database: without the key, they cannot even check a guess against it
const hashCode = (userId: string, code: string) => createHmac('sha256', env.jwtSecret).update(`${userId}:${code}`).digest('hex');

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// One answer for every failure, so a guesser cannot tell a wrong code from an expired one or from an unknown email
const invalidCode = () => validationError('code', 'That code is wrong or has expired. Check it, or ask for a new one.');

// Returns the user a code was sent to, or null when nothing was sent. The caller answers the same
// either way: whether an email address has an account here is nobody else's business.
export async function requestPasswordReset(email: string) {
    // In development the code is written to the server log instead, so the flow can be tried without a mail account
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

    // Not waited for. Sending takes seconds, and a reply that is slow only for real accounts would
    // give away which addresses have one. A failure is logged for whoever runs the server.
    sendPasswordResetEmail({ to: user.email, name: user.username, code, minutes: RESET_CODE_MINUTES }).catch((err) => {
        logger.error({ err }, 'Password reset email could not be sent');
    });
    return user;
}

export async function resetPassword(email: string, code: string, newPassword: string) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) throw invalidCode();

    // Counted before the code is looked at, so every try uses one up whether it is right or wrong
    const reset = await passwordResetRepository.useAttempt(user.id, RESET_MAX_ATTEMPTS, new Date());
    if (!reset) throw invalidCode();

    const codeHash = hashCode(user.id, code);
    if (!sameHash(reset.codeHash, codeHash)) throw invalidCode();

    // A code works once: if two requests arrive with it together, only one gets past this line
    if (!(await passwordResetRepository.consume(user.id, codeHash))) throw invalidCode();

    // Saving (rather than an update query) runs the model hook that hashes the password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Whoever was logged in with the forgotten (or stolen) password is logged out everywhere
    await endAllSessions(user.id);
    return user;
}
