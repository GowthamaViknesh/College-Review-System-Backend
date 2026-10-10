import * as userRepository from '../repositories/user.repository';
import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';

import { PERMISSIONS } from '../common/constants/permissions';
import { ApiError, paginationMeta } from '../common/utils/utils';
import { CreateReviewInput, ListReviewsQuery, UpdateReviewInput } from '../common/interfaces/review.interface';

const alreadyReviewed = () => new ApiError(409, 'You have already reviewed this college; edit your existing review instead');

async function findReview(id: string) {
    const review = await reviewRepository.findByReviewId(id);
    if (!review) throw new ApiError(404, 'Review not found');
    return review;
}

export async function listReviews({ page, limit, sort, college, user, ...rest }: ListReviewsQuery) {
    const [collegeDoc, userDoc] = await Promise.all([college ? collegeRepository.findByCollegeId(college) : null, user ? userRepository.findByUserId(user) : null]);

    if ((college && !collegeDoc) || (user && !userDoc)) return { reviews: [], meta: paginationMeta(page, limit, 0) };

    const filter = { ...rest, ...(collegeDoc && { college: collegeDoc.id }), ...(userDoc && { user: userDoc.id }) };
    const [reviews, total] = await Promise.all([reviewRepository.findPage(filter, sort, page, limit), reviewRepository.count(filter)]);

    return { reviews, meta: paginationMeta(page, limit, total) };
}

export function getReviewById(id: string) {
    return findReview(id);
}

export async function createReview(actorId: string, input: CreateReviewInput) {
    const college = await collegeRepository.findByCollegeId(input.college);
    if (!college) throw new ApiError(404, 'College not found');

    if (await reviewRepository.existsForCollegeAndUser(college.id, actorId)) throw alreadyReviewed();

    try {
        return await reviewRepository.create({ ...input, college: college.id, user: actorId });
    } catch (err) {
        if ((err as { code?: number }).code === 11000) throw alreadyReviewed();
        throw err;
    }
}

export async function updateReview(actorId: string, id: string, input: UpdateReviewInput) {
    const review = await findReview(id);
    if (review.user._id.toString() !== actorId) throw new ApiError(403, 'You can only edit your own review');

    return reviewRepository.updateByReviewId(id, input);
}

export async function deleteReview(actorId: string, actorPermissions: Set<string>, id: string) {
    const review = await findReview(id);

    const isOwner = review.user._id.toString() === actorId;
    if (!isOwner && !actorPermissions.has(PERMISSIONS.REVIEW_DELETE_ANY)) {
        throw new ApiError(403, 'You can only delete your own review');
    }

    await reviewRepository.deleteByReviewId(id);
}

export async function upvoteReview(actor: { id: string; userId: string }, id: string) {
    const review = await findReview(id);
    if (review.user?._id.toString() === actor.id) throw new ApiError(403, 'You cannot upvote your own review');

    await reviewRepository.addVote(id, actor.userId);
    return findReview(id);
}

export async function removeUpvote(actor: { userId: string }, id: string) {
    await findReview(id);
    await reviewRepository.removeVote(id, actor.userId);
    return findReview(id);
}
