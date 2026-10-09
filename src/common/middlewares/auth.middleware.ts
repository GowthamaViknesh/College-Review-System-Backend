import type { RequestHandler } from 'express';

import logger from '../config/logger';
import { ApiError, verifyToken } from '../utils/utils';
import type { PermissionName } from '../constants/permissions';
import * as userRepository from '../../repositories/user.repository';

// The logged-in user, with their role and that role's permissions loaded
export type AuthUser = NonNullable<Awaited<ReturnType<typeof userRepository.findByUserIdWithAccess>>>;

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            // Names of everything the user's role allows, e.g. "review:create"
            permissions?: Set<string>;
        }
    }
}

// "Last active" is for people to read, so a minute's accuracy is plenty. Writing it at most this often
// keeps a busy page (which makes many requests at once) from turning every one of them into a database write.
const LAST_ACTIVE_EVERY_MS = 60_000;

// Requires a valid "Authorization: Bearer <token>" header, then attaches the user and their permissions
export const protect: RequestHandler = async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');

    const payload = verifyToken(header.slice('Bearer '.length));

    // Load from the DB so deleted users and role/permission changes take effect immediately, not at token expiry
    const user = await userRepository.findByUserIdWithAccess(payload.sub);
    if (!user) throw new ApiError(401, 'User no longer exists');

    // A password change ends every login made before it, without waiting for those tokens to expire.
    // Token times are whole seconds, so the comparison is made in whole seconds too.
    const changedAt = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
    if (payload.iat !== undefined && payload.iat < changedAt) throw new ApiError(401, 'Your password was changed. Please log in again.');

    const now = new Date();
    if (!user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() >= LAST_ACTIVE_EVERY_MS) {
        // Bookkeeping only: a failure here must not fail the request it rides on
        await userRepository.touchLastActive(user.id, now).catch((err) => logger.warn({ err }, 'Could not record last activity'));
        user.lastActiveAt = now;
    }

    req.user = user;
    req.permissions = new Set(user.role?.permissions);
    next();
};

// Allows the request only if the user's role grants every listed permission; must run after protect.
// Routes name the action they need, never a role, so access can be changed by editing roles in the database.
export const requirePermission =
    (...required: PermissionName[]): RequestHandler =>
    (req, _res, next) => {
        if (!req.user || !req.permissions) throw new ApiError(401, 'Authentication required');

        const allowed = required.every((permission) => req.permissions!.has(permission));
        if (!allowed) throw new ApiError(403, 'You do not have permission to perform this action');
        next();
    };
