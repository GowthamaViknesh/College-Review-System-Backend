import { v2 as cloudinary } from 'cloudinary';

import { env } from '../config/env';
import logger from '../config/logger';
import { StoredImage } from '../interfaces/user.interface';
import { ApiError, validationError } from './utils';

// The only file that knows pictures live on Cloudinary. Everything else deals in { url, publicId },
// so moving to another store later means rewriting this file and nothing more.

if (env.cloudinary) {
    cloudinary.config({ cloud_name: env.cloudinary.cloudName, api_key: env.cloudinary.apiKey, api_secret: env.cloudinary.apiSecret, secure: true });
}

// What each kind of picture is resized to as it is stored. Originals from a phone camera are several
// times larger than anything the site shows, so the full-size file is never kept.
const KINDS = {
    // Square, centred on the face when there is one
    avatar: { folder: 'college-reviews/avatars', transformation: { width: 400, height: 400, crop: 'fill', gravity: 'face' } },
    // Kept in proportion, only ever made smaller
    college: { folder: 'college-reviews/colleges', transformation: { width: 1600, height: 1000, crop: 'limit' } },
} as const;

export type ImageKind = keyof typeof KINDS;

export function isImageStorageConfigured() {
    return env.cloudinary !== null;
}

// Stores a picture for one user or college. Each owner has a single slot: uploading again replaces
// the previous picture in place, so there is never an old file left behind to clean up.
export function uploadImage(file: Buffer, kind: ImageKind, ownerId: string): Promise<StoredImage> {
    if (!isImageStorageConfigured()) throw new ApiError(503, 'Picture uploads are not set up on this server');

    const { folder, transformation } = KINDS[kind];

    return new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: ownerId,
                overwrite: true,
                // Tells the delivery network to drop its copy of the picture this one replaces
                invalidate: true,
                resource_type: 'image',
                // Checked against the file's real contents, whatever its name or declared type says
                allowed_formats: ['jpg', 'png', 'webp'],
                transformation,
                timeout: 30_000,
            },
            (error, result) => {
                if (result) return resolve({ url: result.secure_url, publicId: result.public_id });

                // 400 means Cloudinary read the file and refused it; anything else is a problem on the storage side
                if (error?.http_code === 400) return reject(validationError('image', 'That file is not a picture we can use. Upload a JPG, PNG or WebP.'));
                logger.error({ err: error }, 'Picture upload failed');
                reject(new ApiError(502, 'The picture could not be stored. Please try again.'));
            },
        );
        upload.end(file);
    });
}

// Never throws: a picture that could not be removed is not a reason to fail the request that no longer needs it
export async function deleteImage(publicId: string): Promise<void> {
    if (!isImageStorageConfigured()) return;

    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch (err) {
        logger.warn({ err, publicId }, 'Could not delete a stored picture');
    }
}
