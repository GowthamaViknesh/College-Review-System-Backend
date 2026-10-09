import type { RequestHandler } from 'express';
import * as roleService from '../services/role.service';
import { setAudit } from '../common/middlewares/audit.middleware';

export const listPermissions: RequestHandler = (_req, res) => {
    const permissions = roleService.listPermissions();
    res.json({ success: true, data: { permissions } });
};

export const listRoles: RequestHandler = async (_req, res) => {
    const roles = await roleService.listRoles();
    res.json({ success: true, data: { roles } });
};

export const getRole: RequestHandler<{ id: string }> = async (req, res) => {
    const role = await roleService.getRoleById(req.params.id);
    res.json({ success: true, data: { role } });
};

export const createRole: RequestHandler = async (req, res) => {
    setAudit(res, { details: { name: req.body.name, permissions: req.body.permissions } });

    const role = await roleService.createRole(req.body);
    setAudit(res, { targetId: role.id });
    res.status(201).json({ success: true, data: { role } });
};

export const updateRole: RequestHandler<{ id: string }> = async (req, res) => {
    // The validated body is exactly the set of fields being changed
    setAudit(res, { details: req.body });

    const role = await roleService.updateRole(req.params.id, req.body);
    res.json({ success: true, data: { role } });
};

export const deleteRole: RequestHandler<{ id: string }> = async (req, res) => {
    await roleService.deleteRole(req.params.id);
    res.status(204).send();
};
