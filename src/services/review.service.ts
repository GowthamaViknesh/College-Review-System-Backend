import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';
import * as userRepository from '../repositories/user.repository';
import { PERMISSIONS } from '../common/constants/permissions';
import { ApiError, paginationMeta } from '../common/utils/utils';
import { CreateReviewInput, ListReviewsQuery, UpdateReviewInput } from '../common/interfaces/review.interface';

const alreadyReviewed = () => new ApiError(409, 'You have already reviewed this college; edit your existing review instead');

// id is the review's public id (reviewId)
async function findReview(id: string) {
    const review = await reviewRepository.findByReviewId(id);
    if (!review) throw new ApiError(404, 'Review not found');
    return review;
}

export async function listReviews({ page, limit, sort, college, user, ...rest }: ListReviewsQuery) {
    // The caller names a college and an author by their public ids; reviews are linked by MongoDB's ids
    const [collegeDoc, userDoc] = await Promise.all([college ? collegeRepository.findByCollegeId(college) : null, user ? userRepository.findByUserId(user) : null]);
    // Asking for the reviews of something that does not exist is an empty list, not an error
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

    // One review per person per college, so nobody can move a college's average by posting repeatedly
    if (await reviewRepository.existsForCollegeAndUser(college.id, actorId)) throw alreadyReviewed();

    try {
        return await reviewRepository.create({ ...input, college: college.id, user: actorId });
    } catch (err) {
        // Two requests at the same instant both pass the check above; the unique index stops the second one
        if ((err as { code?: number }).code === 11000) throw alreadyReviewed();
        throw err;
    }
}

export async function updateReview(actorId: string, id: string, input: UpdateReviewInput) {
    const review = await findReview(id);

    // Permissions say whether you may review at all; this says whether this particular review is yours.
    // Nobody, not even an admin, can change what someone else wrote.
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
