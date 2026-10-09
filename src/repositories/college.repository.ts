import { Types, type PipelineStage } from 'mongoose';

import { College } from '../models/college.model';
import { Review } from '../models/review.model';
import { escapeRegex } from '../common/utils/utils';
import { CollegeFilter, CollegeInput, CollegeSort, CollegeWithStats } from '../common/interfaces/college.interface';

// Adds averageRating and reviewCount to each college by reading its reviews.
// Every review counts: only people whose role allows reviewing can create one, and each
// person can review a college once, so no filtering is needed here.
const WITH_REVIEW_STATS: PipelineStage[] = [
    {
        $lookup: {
            from: Review.collection.name,
            localField: '_id',
            foreignField: 'college',
            // Reduce the college's reviews to a single { averageRating, reviewCount } row inside the join,
            // so the review documents themselves are never loaded into the result
            pipeline: [{ $group: { _id: null, averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }],
            as: 'stats',
        },
    },
    {
        $addFields: {
            // Rounded to 1 decimal as floor(avg * 10 + 0.5) / 10. MongoDB's $round is not used because it rounds
            // a trailing 5 to the nearest even digit (4.25 -> 4.2), where people expect 4.3.
            // No reviews -> no stats row -> every step passes null along, so averageRating is null, not a misleading 0.
            averageRating: { $divide: [{ $floor: { $add: [{ $multiply: [{ $first: '$stats.averageRating' }, 10] }, 0.5] } }, 10] },
            reviewCount: { $ifNull: [{ $first: '$stats.reviewCount' }, 0] },
        },
    },
    { $project: { stats: 0, __v: 0 } },
];

// _id is always the last key so the order is stable when the other values tie.
// In a descending sort MongoDB puts null last, so unrated colleges follow rated ones.
const SORTS: Record<CollegeSort, Record<string, 1 | -1>> = {
    newest: { createdAt: -1, _id: -1 },
    name: { name: 1, _id: 1 },
    rating: { averageRating: -1, reviewCount: -1, _id: 1 },
    reviews: { reviewCount: -1, averageRating: -1, _id: 1 },
};

const exactIgnoringCase = (text: string) => new RegExp(`^${escapeRegex(text)}$`, 'i');

function buildMatch({ search, city, state }: CollegeFilter) {
    const match: Record<string, unknown> = {};
    if (city) match.city = exactIgnoringCase(city);
    if (state) match.state = exactIgnoringCase(state);
    if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        match.$or = [{ name: pattern }, { city: pattern }, { description: pattern }];
    }
    return match;
}

export async function findPageWithStats(filter: CollegeFilter, sort: CollegeSort, pageNumber: number, pageSize: number) {
    const skips = pageSize * (pageNumber - 1);

    const [result] = await College.aggregate<{ colleges: CollegeWithStats[]; total: { count: number }[] }>([
        { $match: buildMatch(filter) },
        ...WITH_REVIEW_STATS,
        // Filtering on the average has to come after it has been calculated
        ...(filter.minRating ? [{ $match: { averageRating: { $gte: filter.minRating } } }] : []),
        { $sort: SORTS[sort] },
        // One round trip returns both the requested page and the total number of matches
        { $facet: { colleges: [{ $skip: skips }, { $limit: pageSize }], total: [{ $count: 'count' }] } },
    ]);

    return { colleges: result.colleges, total: result.total[0]?.count ?? 0 };
}

export async function findByIdWithStats(id: string): Promise<CollegeWithStats | null> {
    const [college] = await College.aggregate<CollegeWithStats>([{ $match: { _id: new Types.ObjectId(id) } }, ...WITH_REVIEW_STATS]);
    return college ?? null;
}

export function existsById(id: string) {
    return College.exists({ _id: id });
}

export function findByName(name: string) {
    return College.findOne({ name: exactIgnoringCase(name) });
}

export function create(input: CollegeInput, createdBy: string) {
    return College.create({ ...input, createdBy });
}

export function updateById(id: string, fields: Partial<CollegeInput>) {
    return College.findByIdAndUpdate(id, fields, { returnDocument: 'after', runValidators: true });
}

export function deleteById(id: string) {
    return College.findByIdAndDelete(id);
}
