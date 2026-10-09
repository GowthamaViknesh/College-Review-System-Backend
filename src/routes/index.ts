import { Router } from 'express';

import userRoutes from './user.routes';
import roleRoutes from './role.routes';
import authzRoutes from './authz.routes';
import reviewRoutes from './review.routes';
import collegeRoutes from './college.routes';
import actionLogRoutes from './action-log.routes';
import statsRoutes from './stats.routes';
import { PERMISSIONS } from '../common/constants/permissions';
import { listPermissions } from '../controllers/role.controller';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';

const router = Router();

// Public: register, login, and reading colleges and reviews. Everything else requires a token.
router.use('/auth', authzRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/colleges', collegeRoutes);
router.use('/reviews', reviewRoutes);
router.use('/action-logs', actionLogRoutes);
router.use('/stats', statsRoutes);

/**
 * @openapi
 * /permissions:
 *   get:
 *     tags: [Roles]
 *     summary: List every permission that can be given to a role
 *     description: >
 *       Requires `role:read`. Permissions are defined in the code, not created through the API,
 *       because each one only means something where an endpoint checks for it.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The permission catalogue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     permissions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Permission'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/permissions', protect, requirePermission(PERMISSIONS.ROLE_READ), listPermissions);

export default router;
