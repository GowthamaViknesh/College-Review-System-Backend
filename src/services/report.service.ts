import * as reportRepository from '../repositories/report.repository';
import * as reviewRepository from '../repositories/review.repository';

import { ApiError, paginationMeta } from '../common/utils/utils';
import { CreateReportInput, HIDE_AFTER_REPORTS, ListReportsQuery, ModerateReportInput } from '../common/interfaces/report.interface';

async function findReport(id: string) {
    const report = await reportRepository.findByReportId(id);
    if (!report) throw new ApiError(404, 'Report not found');
    return report;
}

export async function createReport(actorId: string, input: CreateReportInput) {
    const review = await reviewRepository.findByReviewId(input.review);
    if (!review) throw new ApiError(404, 'Review not found');
    if (review.user?._id.toString() === actorId) throw new ApiError(400, 'You cannot report your own review');

    const report = await reportRepository.create({ review: review.id, reporter: actorId, reason: input.reason, details: input.details });

    // Enough reports take a review out of the lists until a moderator has looked at it
    const open = await reportRepository.countOpenForReview(review.id);
    if (open >= HIDE_AFTER_REPORTS) await reviewRepository.setHidden(review.id, true);

    return findReport(report.reportId);
}

export async function listReports({ page, limit, ...filter }: ListReportsQuery) {
    const [reports, total] = await Promise.all([reportRepository.findPage(filter, page, limit), reportRepository.count(filter)]);
    return { reports, meta: paginationMeta(page, limit, total) };
}

// The person who filed a report can come back to it to see whether it was dealt with
export async function getReport(id: string) {
    return findReport(id);
}

export async function moderateReport(actorId: string, id: string, { status }: ModerateReportInput) {
    const report = await findReport(id);
    if (report.status !== 'open') throw new ApiError(409, 'This report has already been resolved');

    const reviewId = report.review._id.toString();
    if (status === 'actioned') {
        await reviewRepository.setHidden(reviewId, true);
        await reportRepository.resolveOpenForReview(reviewId, 'actioned', actorId);
        return findReport(id);
    }

    const resolved = await reportRepository.resolve(id, 'dismissed', actorId);
    // Nothing else is waiting on this review, so it goes back into the lists
    if ((await reportRepository.countOpenForReview(reviewId)) === 0) await reviewRepository.setHidden(reviewId, false);
    return resolved;
}
