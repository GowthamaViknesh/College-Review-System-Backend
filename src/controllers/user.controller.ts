import type { RequestHandler } from 'express';
import * as userService from '../services/user.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const createUser: RequestHandler = async (req, res) => {
    setAudit(res, { details: { username: req.body.username, role: req.body.role } });

    const user = await userService.createUser(req.permissions!, req.body);
    setAudit(res, { targetId: user.id });
    res.status(201).json({ success: true, data: { user } });
};

export const listUsers: RequestHandler = async (req, res) => {
    // req.query was validated and given defaults by the validate middleware
    const { users, meta } = await userService.listUsers(req.query as any);
    res.json({ success: true, data: { users }, meta });
};

export const getUser: RequestHandler<{ id: string }> = async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    res.json({ success: true, data: { user } });
};

export const updateUserRole: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { role: req.body.role } });

    const user = await userService.updateUserRole(req.user!.id, req.params.id, req.body.role);
    res.json({ success: true, data: { user } });
};

export const deleteUser: RequestHandler<{ id: string }> = async (req, res) => {
    await userService.deleteUser(req.user!.id, req.params.id);
    res.status(204).send();
};
