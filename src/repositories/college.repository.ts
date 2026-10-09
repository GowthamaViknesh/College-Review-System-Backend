import type { PipelineStage } from 'mongoose';

import { College } from '../models/college.model';
import { User } from '../models/user.model';
import { Review } from '../models/review.model';
import { escapeRegex } from '../common/utils/utils';
import { StoredImage } from '../common/interfaces/user.interface';
import { CollegeFilter, CollegeInput, CollegeSort, CollegeWithStats, SortOrder } from '../common/interfaces/college.interface';

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
            // Clients get the picture's address only, never the id it is stored under
            image: { $ifNull: ['$image.url', null] },
        },
    },
    { $project: { stats: 0, __v: 0 } },
];

// The last step before a college leaves the database: MongoDB's ids are swapped for public ones.
// createdBy becomes the creator's userId (null if that account is gone) and _id is dropped.
// It comes after sorting, which uses _id to keep the order stable.
const AS_PUBLIC: PipelineStage.FacetPipelineStage[] = [
    { $lookup: { from: User.collection.name, localField: 'createdBy', foreignField: '_id', pipeline: [{ $project: { _id: 0, userId: 1 } }], as: 'creator' } },
    { $addFields: { createdBy: { $ifNull: [{ $first: '$creator.userId' }, null] } } },
    { $project: { _id: 0, creator: 0 } },
];

// The fields each sort uses, most important first, in the sort's natural direction:
// names A-Z, everything else highest or newest first.
const SORT_KEYS: Record<CollegeSort, [field: string, direction: 1 | -1][]> = {
    newest: [['createdAt', -1]],
    name: [['name', 1]],
    rating: [
        ['averageRating', -1],
        ['reviewCount', -1],
    ],
    reviews: [
        ['reviewCount', -1],
        ['averageRating', -1],
    ],
};

function buildSort(sort: CollegeSort, order?: SortOrder) {
    const keys = SORT_KEYS[sort];
    const natural: SortOrder = keys[0][1] === 1 ? 'asc' : 'desc';
    const flip = order && order !== natural ? -1 : 1;

    const result: Record<string, 1 | -1> = {};
    // Colleges with no rating go last whichever way ratings are ordered; "lowest rated" should not start with them
    if (sort === 'rating') result.unrated = 1;
    for (const [field, direction] of keys) result[field] = (direction * flip) as 1 | -1;
    // _id is always the last key so the order is stable when the other values tie
    result._id = (keys[0][1] * flip) as 1 | -1;
    return result;
}

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

export async function findPageWithStats(filter: CollegeFilter, { sort, order }: { sort: CollegeSort; order?: SortOrder }, pageNumber: number, pageSize: number) {
    const skips = pageSize * (pageNumber - 1);

    const [result] = await College.aggregate<{ colleges: CollegeWithStats[]; total: { count: number }[] }>([
        { $match: buildMatch(filter) },
        ...WITH_REVIEW_STATS,
        // Filtering on the average has to come after it has been calculated
        ...(filter.minRating ? [{ $match: { averageRating: { $gte: filter.minRating } } }] : []),
        { $addFields: { unrated: { $cond: [{ $eq: ['$averageRating', null] }, 1, 0] } } },
        { $sort: buildSort(sort, order) },
        { $unset: 'unrated' },
        // One round trip returns both the requested page and the total number of matches
        { $facet: { colleges: [{ $skip: skips }, { $limit: pageSize }, ...AS_PUBLIC], total: [{ $count: 'count' }] } },
    ]);

    return { colleges: result.colleges, total: result.total[0]?.count ?? 0 };
}

// collegeId is the college's public id, the one that arrives in a URL

export async function findByCollegeIdWithStats(collegeId: string): Promise<CollegeWithStats | null> {
    const [college] = await College.aggregate<CollegeWithStats>([{ $match: { collegeId } }, ...WITH_REVIEW_STATS, ...AS_PUBLIC]);
    return college ?? null;
}

export function findByCollegeId(collegeId: string) {
    return College.findOne({ collegeId });
}

// Returns the college as it was before the change, so the caller can see the picture it had
export function setImageByCollegeId(collegeId: string, image: StoredImage | null) {
    return College.findOneAndUpdate({ collegeId }, { image });
}

export function findByName(name: string) {
    return College.findOne({ name: exactIgnoringCase(name) });
}

export function create(input: CollegeInput, createdBy: string) {
    return College.create({ ...input, createdBy });
}

export function updateByCollegeId(collegeId: string, fields: Partial<CollegeInput>) {
    return College.findOneAndUpdate({ collegeId }, fields, { returnDocument: 'after', runValidators: true });
}

export function deleteByCollegeId(collegeId: string) {
    return College.findOneAndDelete({ collegeId });
}
