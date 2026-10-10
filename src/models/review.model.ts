import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { IReview } from '../common/interfaces/review.interface';

export type ReviewDocument = HydratedDocument<IReview>;

const reviewSchema = new Schema<IReview>(
    {
        reviewId: {
            type: String,
            required: true,
            unique: true,
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
        votes: {
            count: {
                type: Number,
                default: 0,
                min: 0,
            },
            userIds: {
                type: [String],
                default: [],
            },
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

reviewSchema.index({ college: 1, user: 1 }, { unique: true });
reviewSchema.index({ college: 1, createdAt: -1 });

export const Review = model<IReview>('Review', reviewSchema);
