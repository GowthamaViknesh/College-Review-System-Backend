import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';

import { env } from '../config/env';
import { validationError } from '../utils/utils';

export const IMAGE_FIELD = 'image';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const WRONG_TYPE = 'Upload a JPG, PNG or WebP picture';

// The first bytes of a file say what it really is. The type a browser sends is only a claim, and
// anyone calling the API directly can claim anything.
function looksLikeImage(file: Buffer) {
    const startsWith = (bytes: number[], offset = 0) => bytes.every((byte, index) => file[offset + index] === byte);
    const jpeg = startsWith([0xff, 0xd8, 0xff]);
    const png = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
    return jpeg || png || webp;
}

// The picture is held in memory just long enough to pass on to image storage; nothing is written to disk,
// which matters on hosts whose disk is wiped on every deploy.
const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_req, file, done) => (ALLOWED_TYPES.includes(file.mimetype) ? done(null, true) : done(validationError(IMAGE_FIELD, WRONG_TYPE))),
}).single(IMAGE_FIELD);

// Reads one picture from a multipart form into req.file. Put it after the login and permission checks,
// so only people allowed to upload can make the server read a large body.
export const imageUpload: RequestHandler = (req, res, next) => {
    parser(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
            const message =
                err.code === 'LIMIT_FILE_SIZE'
                    ? `The picture must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller`
                    : `Send exactly one picture, in a form field named "${IMAGE_FIELD}"`;
            return next(validationError(IMAGE_FIELD, message));
        }
        if (err) return next(err);

        if (!req.file) return next(validationError(IMAGE_FIELD, `Choose a picture to upload (multipart form field "${IMAGE_FIELD}")`));
        if (!looksLikeImage(req.file.buffer)) return next(validationError(IMAGE_FIELD, WRONG_TYPE));
        next();
    });
};

// Uploads cost storage and bandwidth on someone else's service, so one address cannot send them endlessly
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message: 'Too many uploads, please try again later' },
});
