import { Router } from 'express';

import userRoutes from './user.routes';
import roleRoutes from './role.routes';
import authzRoutes from './authz.routes';
import { PERMISSIONS } from '../common/constants/permissions';
import { listPermissions } from '../controllers/role.controller';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';

const router = Router();

// Only register and login (inside /auth) are public; everything else requires a token
router.use('/auth', authzRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.get('/permissions', protect, requirePermission(PERMISSIONS.ROLE_READ), listPermissions);

export default router;
