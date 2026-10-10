import type { RequestHandler } from 'express';
import * as actionLogService from '../services/action-log.service';

export const listActionLogs: RequestHandler = async (req, res) => {
    const { logs, meta } = await actionLogService.listActionLogs(req.query as any);
    res.json({ success: true, data: { logs }, meta });
};
