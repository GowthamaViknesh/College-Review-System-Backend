import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import { validate } from '../common/middlewares/validate.middleware';
import * as actionLogController from '../controllers/action-log.controller';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { listActionLogsQuerySchema } from '../common/validators/action-log.validator';

const router = Router();

/**
 * @openapi
 * /action-logs:
 *   get:
 *     tags: [Action logs]
 *     summary: See who did what, and what was refused
 *     description: >
 *       Requires `log:read`. Newest first. Every change made through the API is recorded, along with
 *       every refused attempt (403) and every failed login. Entries cannot be edited or deleted,
 *       and are removed automatically after the retention period (90 days by default).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - name: actor
 *         in: query
 *         description: Id of the user who performed the action
 *         schema: { type: string }
 *       - name: action
 *         in: query
 *         schema: { $ref: '#/components/schemas/ActionName' }
 *       - name: outcome
 *         in: query
 *         description: "`denied` = not allowed (403), `failed` = wrong login credentials"
 *         schema: { type: string, enum: [success, denied, failed] }
 *       - name: targetType
 *         in: query
 *         schema: { type: string, enum: [user, role, college, review] }
 *       - name: targetId
 *         in: query
 *         description: Id of the record the action was performed on
 *         schema: { type: string }
 *       - name: from
 *         in: query
 *         description: Only entries at or after this time (ISO 8601)
 *         schema: { type: string, format: date-time }
 *       - name: to
 *         in: query
 *         description: Only entries at or before this time (ISO 8601)
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: One page of log entries
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
 *                     logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ActionLog'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, requirePermission(PERMISSIONS.LOG_READ), validate({ query: listActionLogsQuerySchema }), actionLogController.listActionLogs);

export default router;
