import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import * as roleController from '../controllers/role.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { idParamSchema } from '../common/validators/user.validator';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { createRoleSchema, updateRoleSchema } from '../common/validators/role.validator';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /roles:
 *   get:
 *     tags: [Roles]
 *     summary: List roles
 *     description: Requires `role:read`.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Every role with the permissions it grants
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
 *                     roles:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Role'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', requirePermission(PERMISSIONS.ROLE_READ), roleController.listRoles);

/**
 * @openapi
 * /roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get one role
 *     description: Requires `role:read`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoleResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', requirePermission(PERMISSIONS.ROLE_READ), validate({ params: idParamSchema }), roleController.getRole);

/**
 * @openapi
 * /roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create a role
 *     description: Requires `role:create`. Pick its permissions from `GET /permissions`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleRequest'
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoleResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', requirePermission(PERMISSIONS.ROLE_CREATE), validate({ body: createRoleSchema }), roleController.createRole);

/**
 * @openapi
 * /roles/{id}:
 *   patch:
 *     tags: [Roles]
 *     summary: Rename a role or change its permissions
 *     description: >
 *       Requires `role:update`. Changes apply to everyone with the role on their next request.
 *       The `admin` role cannot be changed (403).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleRequest'
 *     responses:
 *       200:
 *         description: The updated role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoleResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.patch('/:id', requirePermission(PERMISSIONS.ROLE_UPDATE), validate({ params: idParamSchema, body: updateRoleSchema }), roleController.updateRole);

/**
 * @openapi
 * /roles/{id}:
 *   delete:
 *     tags: [Roles]
 *     summary: Delete a role
 *     description: >
 *       Requires `role:delete`. Fails with 409 while any user still has the role, and with 403 for the `admin` role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       204:
 *         description: Deleted
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.delete('/:id', requirePermission(PERMISSIONS.ROLE_DELETE), validate({ params: idParamSchema }), roleController.deleteRole);

export default router;
