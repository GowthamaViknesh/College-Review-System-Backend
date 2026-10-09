import type { RequestHandler } from 'express';
import * as statsService from '../services/stats.service';

export const getOverview: RequestHandler = async (req, res) => {
    const overview = await statsService.getOverview(req.user!.id);
    res.json({ success: true, data: overview });
};
