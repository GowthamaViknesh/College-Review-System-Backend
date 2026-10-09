import Joi from 'joi';
import { objectId } from './user.validator';
import { REVIEW_SORTS } from '../interfaces/review.interface';

const rating = Joi.number().integer().min(1).max(5);
// A minimum length keeps out empty "ok" reviews that carry a rating but no information
const comment = Joi.string().trim().min(10).max(2000);

export const createReviewSchema = Joi.object({
    college: objectId.required(),
    rating: rating.required(),
    comment: comment.required(),
});

// The college and the author of a review can never be changed
export const updateReviewSchema = Joi.object({ rating, comment }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

export const listReviewsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    college: objectId,
    user: objectId,
    minRating: rating,
    maxRating: rating.when('minRating', { is: Joi.exist(), then: Joi.number().min(Joi.ref('minRating')) }),
    search: Joi.string().trim().max(50),
    sort: Joi.string()
        .valid(...REVIEW_SORTS)
        .default('newest'),
});
