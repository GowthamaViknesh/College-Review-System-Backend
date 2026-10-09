import type { RequestHandler } from 'express';
import * as collegeService from '../services/college.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const listColleges: RequestHandler = async (req, res) => {
    // req.query was validated and given defaults by the validate middleware
    const { colleges, meta } = await collegeService.listColleges(req.query as any);
    res.json({ success: true, data: { colleges }, meta });
};

export const getCollege: RequestHandler<{ id: string }> = async (req, res) => {
    const college = await collegeService.getCollegeById(req.params.id);
    res.json({ success: true, data: { college } });
};

export const createCollege: RequestHandler = async (req, res) => {
    setAudit(res, { details: { name: req.body.name } });

    const college = await collegeService.createCollege(req.user!.id, req.body);
    setAudit(res, { targetId: String(college._id) });
    res.status(201).json({ success: true, data: { college } });
};

export const updateCollege: RequestHandler<{ id: string }> = async (req, res) => {
    // Which fields were changed, not their full text: a description can be long
    setAudit(res, { details: { changed: Object.keys(req.body) } });

    const college = await collegeService.updateCollege(req.params.id, req.body);
    res.json({ success: true, data: { college } });
};

export const deleteCollege: RequestHandler<{ id: string }> = async (req, res) => {
    await collegeService.deleteCollege(req.params.id);
    res.status(204).send();
};
