import { Schema, model } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { IReport, REPORT_REASONS, REPORT_STATUSES } from '../common/interfaces/report.interface';

const reportSchema = new Schema<IReport>(
    {
        reportId: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            default: () => generatePublicId(),
        },
        review: {
            type: Schema.Types.ObjectId,
            ref: 'Review',
            required: true,
            index: true,
        },
        reporter: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        reason: {
            type: String,
            enum: REPORT_REASONS,
            required: true,
        },
        details: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
        status: {
            type: String,
            enum: REPORT_STATUSES,
            default: 'open',
        },
        resolvedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, __v, ...report } = ret;
                return report;
            },
        },
    },
);

// The moderation queue lists open reports, newest first
reportSchema.index({ status: 1, createdAt: -1 });

export const Report = model<IReport>('Report', reportSchema);
