import * as collegeRepository from '../repositories/college.repository';
import * as ratingRepository from '../repositories/rating.repository';

// The rating shown for the whole site on the dashboard: the average of every college's rating
export async function getOverallRating() {
    const colleges = await collegeRepository.findAllIds();
    if (colleges.length === 0) return null;

    let total = 0;
    for (const college of colleges) {
        const { averageRating } = await ratingRepository.findForCollege(college._id);
        total += averageRating ?? 0;
    }
    return ratingRepository.roundRating(total / colleges.length);
}
