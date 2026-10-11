import type { Types } from 'mongoose';

export const REPORT_REASONS = ['spam', 'abusive', 'off_topic', 'false_information', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// open: waiting for a moderator. dismissed: nothing wrong with the review. actioned: the review was hidden.
export const REPORT_STATUSES = ['open', 'dismissed', 'actioned'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// A review with this many open reports is hidden from the review lists until a moderator decides
export const HIDE_AFTER_REPORTS = 3;

export interface IReport {
    reportId: string;
    review: Types.ObjectId;
    reporter: Types.ObjectId;
    reason: ReportReason;
    details: string;
    status: ReportStatus;
    resolvedBy: Types.ObjectId | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateReportInput {
    // The review's public id (reviewId)
    review: string;
    reason: ReportReason;
    details?: string;
}

export interface ModerateReportInput {
    status: Exclude<ReportStatus, 'open'>;
}

export interface ReportFilter {
    status?: ReportStatus;
    reason?: ReportReason;
    search?: string;
}

export interface ListReportsQuery extends ReportFilter {
    page: number;
    limit: number;
}
