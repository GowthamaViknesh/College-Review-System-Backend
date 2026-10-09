import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface ErrorDetail {
    field: string;
    message: string;
}

// An expected, client-facing error; anything else reaching the error handler is treated as a 500
export class ApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public details?: ErrorDetail[],
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// A 400 in the same shape Joi validation errors use, for checks that need the database
export function validationError(field: string, message: string): ApiError {
    return new ApiError(400, 'Validation failed', [{ field, message }]);
}

// The token only identifies the user. Role and permissions are read from the database on each
// request, so a role change takes effect immediately instead of when the token expires.
export interface TokenPayload {
    sub: string;
    // When the token was issued, in seconds. Added by the signing library.
    iat?: number;
}

export function signToken(payload: Pick<TokenPayload, 'sub'>): string {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
}

// Escape user input before using it inside a RegExp (prevents regex injection / ReDoS)
export function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function paginationMeta(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
