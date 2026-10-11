import type { RequestHandler } from 'express';
import * as reportService from '../services/report.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const createReport: RequestHandler = async (req, res) => {
    setAudit(res, { details: { review: req.body.review, reason: req.body.reason } });

    const report = await reportService.createReport(req.user!.id, req.body);
    setAudit(res, { targetId: report.reportId });
    res.status(201).json({ success: true, data: { report } });
};

export const listReports: RequestHandler = async (req, res) => {
    // req.query was validated and given defaults by the validate middleware
    const { reports, meta } = await reportService.listReports(req.query as any);
    res.json({ success: true, data: { reports }, meta });
};

export const getReport: RequestHandler<{ id: string }> = async (req, res) => {
    const report = await reportService.getReport(req.params.id);
    res.json({ success: true, data: { report } });
};

export const moderateReport: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { status: req.body.status } });

    const report = await reportService.moderateReport(req.user!.id, req.params.id, req.body);
    res.json({ success: true, data: { report } });
};
