import { Review } from '../models/review.model';
import { escapeRegex } from '../common/utils/utils';
import { ReviewFilter, ReviewSort, UpdateReviewInput } from '../common/interfaces/review.interface';

// In API responses a review shows who wrote it and which college it is about, not just their ids
const AUTHOR_AND_COLLEGE = [
    { path: 'user', select: 'userId username avatar' },
    { path: 'college', select: 'collegeId name' },
];

const SORTS: Record<ReviewSort, Record<string, 1 | -1>> = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    highest: { rating: -1, createdAt: -1, _id: -1 },
    lowest: { rating: 1, createdAt: -1, _id: -1 },
};

function buildFilter({ college, user, minRating, maxRating, search }: ReviewFilter) {
    const filter: Record<string, unknown> = {};
    if (college) filter.college = college;
    if (user) filter.user = user;
    if (minRating || maxRating) {
        filter.rating = { ...(minRating && { $gte: minRating }), ...(maxRating && { $lte: maxRating }) };
    }
    if (search) filter.comment = new RegExp(escapeRegex(search), 'i');
    return filter;
}

export function findPage(filter: ReviewFilter, sort: ReviewSort, pageNumber: number, pageSize: number) {
    const skips = pageSize * (pageNumber - 1);

    return Review.find(buildFilter(filter)).sort(SORTS[sort]).skip(skips).limit(pageSize).populate(AUTHOR_AND_COLLEGE);
}

export function count(filter: ReviewFilter) {
    return Review.countDocuments(buildFilter(filter));
}

// reviewId is the review's public id, the one that arrives in a URL
export function findByReviewId(reviewId: string) {
    return Review.findOne({ reviewId }).populate(AUTHOR_AND_COLLEGE);
}

export function existsForCollegeAndUser(college: string, user: string) {
    return Review.exists({ college, user });
}

export async function create(fields: { college: string; user: string; rating: number; comment: string }) {
    const review = await Review.create(fields);
    return review.populate(AUTHOR_AND_COLLEGE);
}

export function updateByReviewId(reviewId: string, fields: UpdateReviewInput) {
    return Review.findOneAndUpdate({ reviewId }, fields, { returnDocument: 'after', runValidators: true }).populate(AUTHOR_AND_COLLEGE);
}

export function deleteByReviewId(reviewId: string) {
    return Review.findOneAndDelete({ reviewId });
}

export function deleteByCollege(college: string) {
    return Review.deleteMany({ college });
}

export function deleteByUser(user: string) {
    return Review.deleteMany({ user });
}
