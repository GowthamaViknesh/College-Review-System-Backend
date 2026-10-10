import jwt, { type SignOptions } from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { env } from '../config/env';

export interface ErrorDetail {
    field: string;
    message: string;
}

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

export function validationError(field: string, message: string): ApiError {
    return new ApiError(400, 'Validation failed', [{ field, message }]);
}

export interface TokenPayload {
    sub: string;
    iat?: number;
}

export function signToken(payload: Pick<TokenPayload, 'sub'>): string {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
}

export function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function paginationMeta(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

const PUBLIC_ID_LENGTH = 16;
const PUBLIC_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const PUBLIC_ID_PATTERN = new RegExp(`^[0-9A-Za-z]{${PUBLIC_ID_LENGTH}}$`);

export const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);
