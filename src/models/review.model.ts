import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/public-id';
import { IReview } from '../common/interfaces/review.interface';

export type ReviewDocument = HydratedDocument<IReview>;

const reviewSchema = new Schema<IReview>(
    {
        // The id the API uses for this record. Created with it, and never changed afterwards.
        reviewId: {
            type: String,
            required: true,
            unique: true,
            // Records with no id yet are left out of the unique index instead of colliding on "missing"
            sparse: true,
            immutable: true,
            trim: true,
            default: () => generatePublicId(),
        },
        college: {
            type: Schema.Types.ObjectId,
            ref: 'College',
            required: [true, 'College is required'],
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User is required'],
            index: true,
        },
        rating: {
            type: Number,
            required: [true, 'Rating is required'],
            min: [1, 'Rating must be at least 1'],
            max: [5, 'Rating must be at most 5'],
            validate: { validator: Number.isInteger, message: 'Rating must be a whole number' },
        },
        comment: {
            type: String,
            required: [true, 'Comment is required'],
            trim: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, __v, ...review } = ret;
                return review;
            },
        },
    },
);

// One review per person per college. Without this a single user could post many reviews
// and decide a college's average on their own. The database enforces it, so it holds
// even if two requests arrive at the same moment.
reviewSchema.index({ college: 1, user: 1 }, { unique: true });

// Supports "reviews for this college, newest first", the most common query
reviewSchema.index({ college: 1, createdAt: -1 });

export const Review = model<IReview>('Review', reviewSchema);
