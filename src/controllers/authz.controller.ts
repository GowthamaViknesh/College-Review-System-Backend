import type { RequestHandler } from 'express';
import * as authzService from '../services/authz.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const register: RequestHandler = async (req, res) => {
    const { user, token } = await authzService.register(req.body);
    setAudit(res, { actor: { id: user.id, username: user.username }, targetId: user.id });
    res.status(201).json({ success: true, data: { user, token } });
};

export const login: RequestHandler = async (req, res) => {
    // Recorded for failed attempts too, so repeated guessing against one account is visible. Never the password.
    setAudit(res, { details: { email: req.body.email } });

    const { user, token } = await authzService.login(req.body.email, req.body.password);
    setAudit(res, { actor: { id: user.id, username: user.username }, targetId: user.id });
    res.json({ success: true, data: { user, token } });
};

export const updateMe: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.id, details: { changed: Object.keys(req.body) } });

    const user = await authzService.updateProfile(req.user!.id, req.body);
    res.json({ success: true, data: { user } });
};

export const changeMyPassword: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.id });

    await authzService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    res.status(204).send();
};

// Returns who is logged in and what they may do, so a client can show or hide features
export const me: RequestHandler = (req, res) => {
    const { role, ...user } = req.user!.toJSON();
    res.json({
        success: true,
        data: {
            user: { ...user, role: role && { _id: role._id, name: role.name } },
            permissions: [...req.permissions!].sort(),
        },
    });
};
