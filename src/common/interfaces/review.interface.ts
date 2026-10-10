import type { Types } from 'mongoose';

export interface IReview {
    reviewId: string;
    college: Types.ObjectId;
    user: Types.ObjectId;
    rating: number;
    votes: { count: number; userIds: string[] };
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateReviewInput {
    college: string;
    rating: number;
    comment: string;
}

export type UpdateReviewInput = Partial<Pick<CreateReviewInput, 'rating' | 'comment'>>;

export const REVIEW_SORTS = ['newest', 'oldest', 'highest', 'lowest', 'helpful'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

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
