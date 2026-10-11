import { Types, type PipelineStage } from 'mongoose';

import { Review } from '../models/review.model';

// One place that turns a college's reviews into { averageRating, reviewCount }. College pages, the
// college list and the dashboard all read ratings through here, so they can no longer drift apart.

// Rounded to one decimal place; null when there are no reviews (0 would look like a terrible score)
export const roundRating = (average: number) => Math.round(average * 10) / 10;

// Adds averageRating and reviewCount to each college in an aggregation
export const WITH_REVIEW_STATS: PipelineStage[] = [
    {
        $lookup: {
            from: Review.collection.name,
            localField: '_id',
            foreignField: 'college',
            pipeline: [{ $group: { _id: null, averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }],
            as: 'stats',
        },
    },
    {
        $addFields: {
            averageRating: { $round: [{ $first: '$stats.averageRating' }, 1] },
            reviewCount: { $ifNull: [{ $first: '$stats.reviewCount' }, 0] },
        },
    },
    { $project: { stats: 0 } },
];

// college is MongoDB's id of the college
export async function findForCollege(college: Types.ObjectId | string) {
    const [row] = await Review.aggregate<{ averageRating: number; reviewCount: number }>([
        { $match: { college: new Types.ObjectId(college) } },
        { $group: { _id: null, averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
    ]);
    if (!row) return { averageRating: null, reviewCount: 0 };
    return { averageRating: roundRating(row.averageRating), reviewCount: row.reviewCount };
}
