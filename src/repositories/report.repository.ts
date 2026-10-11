import { Report } from '../models/report.model';
import type { ReportFilter, ReportReason, ReportStatus } from '../common/interfaces/report.interface';

// A report shows the review it is about, who filed it, and who closed it
const DETAILS = [
    { path: 'review', select: 'reviewId rating comment hidden' },
    { path: 'reporter', select: 'userId username email' },
    { path: 'resolvedBy', select: 'userId username' },
];

function buildFilter({ status, reason, search }: ReportFilter) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (reason) filter.reason = reason;
    if (search) filter.details = new RegExp(search, 'i');
    return filter;
}

export function create(fields: { review: string; reporter: string; reason: ReportReason; details?: string }) {
    return Report.create(fields);
}

export function findByReportId(reportId: string) {
    return Report.findOne({ reportId }).populate(DETAILS);
}

export function findPage(filter: ReportFilter, pageNumber: number, pageSize: number) {
    return Report.find(buildFilter(filter))
        .sort({ createdAt: -1, _id: -1 })
        .skip(pageSize * (pageNumber - 1))
        .limit(pageSize)
        .populate(DETAILS);
}

export function count(filter: ReportFilter) {
    return Report.countDocuments(buildFilter(filter));
}

// review is MongoDB's id of the review
export function countOpenForReview(review: string) {
    return Report.countDocuments({ review, status: 'open' });
}

export function resolve(reportId: string, status: Exclude<ReportStatus, 'open'>, resolvedBy: string) {
    return Report.findOneAndUpdate({ reportId }, { status, resolvedBy, resolvedAt: new Date() }, { returnDocument: 'after' }).populate(DETAILS);
}

// Once a moderator acts on a review, the other reports about it are settled the same way
export function resolveOpenForReview(review: string, status: Exclude<ReportStatus, 'open'>, resolvedBy: string) {
    return Report.updateMany({ review, status: 'open' }, { status, resolvedBy, resolvedAt: new Date() });
}

export function deleteByReview(review: string) {
    return Report.deleteMany({ review });
}
