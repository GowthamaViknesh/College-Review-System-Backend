import type { Types } from 'mongoose';

export interface IReview {
    // The id the API uses for this review. MongoDB's _id never leaves the server.
    reviewId: string;
    college: Types.ObjectId;
    user: Types.ObjectId;
    // Whole number from 1 (worst) to 5 (best)
    rating: number;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateReviewInput {
    // The college's public id (collegeId)
    college: string;
    rating: number;
    comment: string;
}

export type UpdateReviewInput = Partial<Pick<CreateReviewInput, 'rating' | 'comment'>>;

export const REVIEW_SORTS = ['newest', 'oldest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

// college and user are MongoDB ids here: the service has already looked up the public ids it was given
export interface ReviewFilter {
    college?: string;
    user?: string;
    minRating?: number;
    maxRating?: number;
    search?: string;
}

export interface ListReviewsQuery extends ReviewFilter {
    page: number;
    limit: number;
    sort: ReviewSort;
}
