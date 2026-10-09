import type { Types } from 'mongoose';

export interface IRefreshToken {
    refreshTokenId: string;
    user: Types.ObjectId;
    // SHA-256 of the token. The token itself is never stored, so a copy of the database cannot be used to log in.
    tokenHash: string;
    // Every token descended from one login shares a family, so the whole chain can be ended at once
    family: string;
    expiresAt: Date;
    // When it was exchanged for a newer one; null while it is still the current token of its family
    usedAt: Date | null;
    createdAt: Date;
}

// What a client holds while logged in: a short-lived token for API calls, and one to get the next pair
export interface SessionTokens {
    token: string;
    refreshToken: string;
}
