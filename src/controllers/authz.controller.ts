import type { RequestHandler } from 'express';

import { setAudit } from '../common/middlewares/audit.middleware';

import * as authzService from '../services/authz.service';
import * as sessionService from '../services/session.service';
import * as passwordResetService from '../services/password-reset.service';

export const register: RequestHandler = async (req, res) => {
    const { user, token, refreshToken } = await authzService.register(req.body);
    setAudit(res, { actor: { id: user.userId, username: user.username }, targetId: user.userId });
    res.status(201).json({ success: true, data: { user, token, refreshToken } });
};

export const login: RequestHandler = async (req, res) => {
    setAudit(res, { details: { email: req.body.email } });

    const { user, token, refreshToken } = await authzService.login(req.body.email, req.body.password);
    setAudit(res, { actor: { id: user.userId, username: user.username }, targetId: user.userId });
    res.json({ success: true, data: { user, token, refreshToken } });
};

export const refresh: RequestHandler = async (req, res) => {
    const tokens = await sessionService.refreshSession(req.body.refreshToken);
    res.json({ success: true, data: tokens });
};

export const logout: RequestHandler = async (req, res) => {
    const user = await sessionService.endSession(req.body.refreshToken);
    setAudit(res, user ? { actor: { id: user.userId, username: user.username }, targetId: user.userId } : { skip: true });
    res.status(204).send();
};

export const updateMe: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.userId, details: { changed: Object.keys(req.body) } });

    const user = await authzService.updateProfile(req.user!.id, req.body);
    res.json({ success: true, data: { user } });
};

export const forgotPassword: RequestHandler = async (req, res) => {
    const user = await passwordResetService.requestPasswordReset(req.body.email);
    setAudit(res, user ? { actor: { id: user.userId, username: user.username }, targetId: user.userId } : { skip: true });
    res.json({ success: true, data: { message: 'If an account exists for that email, a reset code has been sent to it.' } });
};

export const verifyResetCode: RequestHandler = async (req, res) => {
    const result = await passwordResetService.verifyResetCode(req.body.email, req.body.code);
    res.json({ success: true, data: result });
};

export const resetPassword: RequestHandler = async (req, res) => {
    const user = await passwordResetService.resetPassword(req.body.resetToken, req.body.newPassword);
    setAudit(res, { actor: { id: user.userId, username: user.username }, targetId: user.userId });
    res.status(204).send();
};

export const uploadMyAvatar: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.userId, details: { changed: ['avatar'] } });

    const user = await authzService.setAvatar(req.user!, req.file!.buffer);
    res.json({ success: true, data: { user } });
};

export const removeMyAvatar: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.userId, details: { changed: ['avatar'] } });

    const user = await authzService.removeAvatar(req.user!.id, req.user!.avatar);
    res.json({ success: true, data: { user } });
};

export const changeMyPassword: RequestHandler = async (req, res) => {
    setAudit(res, { targetId: req.user!.userId });

    const tokens = await authzService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, data: tokens });
};

export const me: RequestHandler = (req, res) => {
    const { role, ...user } = req.user!.toJSON();
    res.json({
        success: true,
        data: {
            user: { ...user, role: role && { roleId: role.roleId, name: role.name } },
            permissions: [...req.permissions!].sort(),
        },
    });
};
