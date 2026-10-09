import type { RequestHandler } from 'express';
import * as authzService from '../services/authz.service';

export const register: RequestHandler = async (req, res) => {
    const { user, token } = await authzService.register(req.body);
    res.status(201).json({ success: true, data: { user, token } });
};

export const login: RequestHandler = async (req, res) => {
    const { user, token } = await authzService.login(req.body.email, req.body.password);
    res.json({ success: true, data: { user, token } });
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
