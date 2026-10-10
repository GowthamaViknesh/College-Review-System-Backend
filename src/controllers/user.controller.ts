import type { RequestHandler } from 'express';
import * as userService from '../services/user.service';
import type { Request } from 'express';
import { setAudit } from '../common/middlewares/audit.middleware';

// Who is asking, in the form the service works with
function actorOf(req: Request): userService.Actor {
    const college = req.user!.college;
    return {
        userId: req.user!.userId,
        permissions: req.permissions!,
        college: college ? { id: String(college._id), collegeId: college.collegeId } : null,
    };
}

export const createUser: RequestHandler = async (req, res) => {
    setAudit(res, { details: { username: req.body.username, role: req.body.role, ...(req.body.college && { college: req.body.college }) } });

    const user = await userService.createUser(actorOf(req), req.body);
    setAudit(res, { targetId: user.userId });
    res.status(201).json({ success: true, data: { user } });
};

export const listUsers: RequestHandler = async (req, res) => {
    // req.query was validated and given defaults by the validate middleware
    const { users, meta } = await userService.listUsers(actorOf(req), req.query as any);
    res.json({ success: true, data: { users }, meta });
};

export const getUser: RequestHandler<{ id: string }> = async (req, res) => {
    const user = await userService.getUserById(actorOf(req), req.params.id);
    res.json({ success: true, data: { user } });
};

export const updateUser: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { changed: Object.keys(req.body) } });

    const user = await userService.updateUser(actorOf(req), req.params.id, req.body);
    res.json({ success: true, data: { user } });
};

export const uploadUserAvatar: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { changed: ['avatar'] } });

    const user = await userService.setUserAvatar(actorOf(req), req.params.id, req.file!.buffer);
    res.json({ success: true, data: { user } });
};

export const removeUserAvatar: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { changed: ['avatar'] } });

    const user = await userService.removeUserAvatar(actorOf(req), req.params.id);
    res.json({ success: true, data: { user } });
};

export const updateUserRole: RequestHandler<{ id: string }> = async (req, res) => {
    setAudit(res, { details: { role: req.body.role } });

    const user = await userService.updateUserRole(req.user!.userId, req.params.id, req.body.role);
    res.json({ success: true, data: { user } });
};

export const deleteUser: RequestHandler<{ id: string }> = async (req, res) => {
    await userService.deleteUser(actorOf(req), req.params.id);
    res.status(204).send();
};
