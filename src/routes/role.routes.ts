import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import * as roleController from '../controllers/role.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { idParamSchema } from '../common/validators/user.validator';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { createRoleSchema, updateRoleSchema } from '../common/validators/role.validator';

const router = Router();

router.use(protect);

router.get('/', requirePermission(PERMISSIONS.ROLE_READ), roleController.listRoles);
router.get('/:id', requirePermission(PERMISSIONS.ROLE_READ), validate({ params: idParamSchema }), roleController.getRole);
router.post('/', requirePermission(PERMISSIONS.ROLE_CREATE), validate({ body: createRoleSchema }), roleController.createRole);
router.patch('/:id', requirePermission(PERMISSIONS.ROLE_UPDATE), validate({ params: idParamSchema, body: updateRoleSchema }), roleController.updateRole);
router.delete('/:id', requirePermission(PERMISSIONS.ROLE_DELETE), validate({ params: idParamSchema }), roleController.deleteRole);

export default router;
