import { College } from '../models/college.model';
import { Review } from '../models/review.model';

interface ReviewFacets {
    perDay: { _id: string; count: number }[];
    byRating: { _id: number; count: number }[];
    overall: { total: number; averageRating: number }[];
}

export function countColleges() {
    return College.estimatedDocumentCount();
}

export function countReviewsByUser(userId: string) {
    return Review.countDocuments({ user: userId });
}

// One pass over the reviews collection answers three questions at once ($facet runs each branch on the same input):
// how many reviews were written on each day since `since`, how many reviews gave each rating, and the overall total and mean.
export async function reviewFacets(since: Date): Promise<ReviewFacets> {
    const [facets] = await Review.aggregate<ReviewFacets>([
        {
            $facet: {
                perDay: [{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }],
                byRating: [{ $group: { _id: '$rating', count: { $sum: 1 } } }],
                overall: [{ $group: { _id: null, total: { $sum: 1 }, averageRating: { $avg: '$rating' } } }],
            },
        },
    ]);
    return facets;
}
