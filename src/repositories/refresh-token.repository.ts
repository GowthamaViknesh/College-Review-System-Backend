import { RefreshToken } from '../models/refresh-token.model';

export function create(fields: { user: string; tokenHash: string; family: string; expiresAt: Date }) {
    return RefreshToken.create(fields);
}

// Marks an unused, unexpired token as used and returns it, in one database operation.
// Two requests arriving with the same token cannot both get it: the second finds nothing.
export function claim(tokenHash: string, now: Date) {
    return RefreshToken.findOneAndUpdate({ tokenHash, usedAt: null, expiresAt: { $gt: now } }, { usedAt: now });
}

export function findByHash(tokenHash: string) {
    return RefreshToken.findOne({ tokenHash });
}

export function deleteFamily(family: string) {
    return RefreshToken.deleteMany({ family });
}

export function deleteByUser(user: string) {
    return RefreshToken.deleteMany({ user });
}
