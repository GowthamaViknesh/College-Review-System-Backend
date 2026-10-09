import type { RequestHandler } from 'express';

import { ApiError, verifyToken } from '../utils/utils';
import type { PermissionName } from '../constants/permissions';
import * as userRepository from '../../repositories/user.repository';

// The logged-in user, with their role and that role's permissions loaded
export type AuthUser = NonNullable<Awaited<ReturnType<typeof userRepository.findByIdWithAccess>>>;

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            // Names of everything the user's role allows, e.g. "review:create"
            permissions?: Set<string>;
        }
    }
}

// Requires a valid "Authorization: Bearer <token>" header, then attaches the user and their permissions
export const protect: RequestHandler = async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');

    const payload = verifyToken(header.slice('Bearer '.length));

    // Load from the DB so deleted users and role/permission changes take effect immediately, not at token expiry
    const user = await userRepository.findByIdWithAccess(payload.sub);
    if (!user) throw new ApiError(401, 'User no longer exists');

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
