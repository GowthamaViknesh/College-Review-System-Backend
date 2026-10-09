import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import * as userController from '../controllers/user.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { assignRoleSchema, createUserSchema, idParamSchema, listUsersQuerySchema } from '../common/validators/user.validator';

const router = Router();

router.use(protect);

router.post('/', requirePermission(PERMISSIONS.USER_CREATE), validate({ body: createUserSchema }), userController.createUser);
router.get('/', requirePermission(PERMISSIONS.USER_READ), validate({ query: listUsersQuerySchema }), userController.listUsers);
router.get('/:id', requirePermission(PERMISSIONS.USER_READ), validate({ params: idParamSchema }), userController.getUser);
router.patch('/:id/role', requirePermission(PERMISSIONS.ROLE_ASSIGN), validate({ params: idParamSchema, body: assignRoleSchema }), userController.updateUserRole);
router.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), validate({ params: idParamSchema }), userController.deleteUser);

export default router;
