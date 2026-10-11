import * as statsRepository from '../repositories/stats.repository';
import * as ratingService from './rating.service';

const DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

// Figures for the dashboard. Days are counted in UTC.
export async function getOverview(userId: string) {
    const today = new Date(toDateKey(new Date())); // midnight UTC
    const since = new Date(today.getTime() - (DAYS - 1) * DAY_MS);

    const [colleges, myReviews, facets, averageRating] = await Promise.all([
        statsRepository.countColleges(),
        statsRepository.countReviewsByUser(userId),
        statsRepository.reviewFacets(since),
        ratingService.getOverallRating(),
    ]);

    // The aggregation only returns days and ratings that have reviews; fill the gaps with 0 so a chart gets every point
    const countByDay = new Map(facets.perDay.map((day) => [day._id, day.count]));
    const reviewsPerDay = Array.from({ length: DAYS }, (_, i) => {
        const date = toDateKey(new Date(since.getTime() + i * DAY_MS));
        return { date, count: countByDay.get(date) ?? 0 };
    });

    const countByRating = new Map(facets.byRating.map((row) => [row._id, row.count]));
    const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: countByRating.get(rating) ?? 0 }));

    const overall = facets.overall[0];
    return {
        totals: {
            colleges,
            reviews: overall?.total ?? 0,
            averageRating,
            myReviews,
        },
        reviewsPerDay,
        ratingDistribution,
    };
}
