import Joi from 'joi';
import { publicId } from './user.validator';
import { REPORT_REASONS, REPORT_STATUSES } from '../interfaces/report.interface';

export const createReportSchema = Joi.object({
    review: publicId.required(),
    reason: Joi.string()
        .valid(...REPORT_REASONS)
        .required(),
    details: Joi.string().trim().max(500).allow(''),
});

export const listReportsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...REPORT_STATUSES),
    reason: Joi.string().valid(...REPORT_REASONS),
    search: Joi.string().trim().max(50),
});

export const moderateReportSchema = Joi.object({
    status: Joi.string().valid('dismissed', 'actioned').required(),
});
