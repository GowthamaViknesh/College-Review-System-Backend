import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import { ACTIONS } from '../common/constants/actions';
import { audit } from '../common/middlewares/audit.middleware';
import * as userController from '../controllers/user.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { assignRoleSchema, createUserSchema, idParamSchema, listUsersQuerySchema } from '../common/validators/user.validator';

const router = Router();

router.use(protect);

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create an account for someone else
 *     description: >
 *       Requires `user:create`. Giving the new user any role other than `student` also requires `role:assign`,
 *       so a teacher can create students but cannot create an admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', audit(ACTIONS.USER_CREATE, 'user'), requirePermission(PERMISSIONS.USER_CREATE), validate({ body: createUserSchema }), userController.createUser);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Requires `user:read`. Newest first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - name: role
 *         in: query
 *         description: Only users with this role name
 *         schema: { type: string, example: student }
 *       - name: search
 *         in: query
 *         description: Case-insensitive match on username or email
 *         schema: { type: string, maxLength: 50 }
 *     responses:
 *       200:
 *         description: One page of users
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
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', requirePermission(PERMISSIONS.USER_READ), validate({ query: listUsersQuerySchema }), userController.listUsers);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get one user
 *     description: Requires `user:read`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', requirePermission(PERMISSIONS.USER_READ), validate({ params: idParamSchema }), userController.getUser);

/**
 * @openapi
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role
 *     description: Requires `role:assign`. Takes effect on the user's next request. You cannot change your own role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleRequest'
 *     responses:
 *       200:
 *         description: The user with their new role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
    '/:id/role',
    audit(ACTIONS.ROLE_ASSIGN, 'user'),
    requirePermission(PERMISSIONS.ROLE_ASSIGN),
    validate({ params: idParamSchema, body: assignRoleSchema }),
    userController.updateUserRole,
);

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user
 *     description: Requires `user:delete`. You cannot delete your own account.
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
 */
router.delete('/:id', audit(ACTIONS.USER_DELETE, 'user'), requirePermission(PERMISSIONS.USER_DELETE), validate({ params: idParamSchema }), userController.deleteUser);

export default router;
