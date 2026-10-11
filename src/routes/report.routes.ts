import { Router } from 'express';

import { ACTIONS } from '../common/constants/actions';
import { PERMISSIONS } from '../common/constants/permissions';
import { audit } from '../common/middlewares/audit.middleware';
import * as reportController from '../controllers/report.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { idParamSchema } from '../common/validators/user.validator';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { createReportSchema, listReportsQuerySchema, moderateReportSchema } from '../common/validators/report.validator';

const router = Router();

/**
 * @openapi
 * /reports:
 *   post:
 *     tags: [Reports]
 *     summary: Report a review
 *     description: >
 *       Requires `review:create`, so it is open to the people who write reviews. You cannot report your own review.
 *       A review with 3 open reports is hidden from the review lists until a moderator decides.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReportRequest'
 *     responses:
 *       201:
 *         description: Report filed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReportResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: The review does not exist
 */
router.post(
    '/',
    audit(ACTIONS.REPORT_CREATE, 'report'),
    protect,
    requirePermission(PERMISSIONS.REVIEW_CREATE),
    validate({ body: createReportSchema }),
    reportController.createReport,
);

/**
 * @openapi
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: The moderation queue
 *     description: Requires `report:moderate`. Newest first; filter by status to see what is still open.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [open, dismissed, actioned] }
 *       - name: reason
 *         in: query
 *         schema: { type: string, enum: [spam, abusive, off_topic, false_information, other] }
 *       - name: search
 *         in: query
 *         description: Words in the reporter's details
 *         schema: { type: string, maxLength: 50 }
 *     responses:
 *       200:
 *         description: One page of reports
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, requirePermission(PERMISSIONS.REPORT_MODERATE), validate({ query: listReportsQuerySchema }), reportController.listReports);

/**
 * @openapi
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: One report
 *     description: Lets the person who filed a report check on it, and moderators open it from the queue.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The report
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReportResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, validate({ params: idParamSchema }), reportController.getReport);

/**
 * @openapi
 * /reports/{id}:
 *   patch:
 *     tags: [Reports]
 *     summary: Resolve a report
 *     description: >
 *       `actioned` hides the review and closes every other open report about it. `dismissed` closes this report,
 *       and puts the review back in the lists once no other reports are open.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ModerateReportRequest'
 *     responses:
 *       200:
 *         description: The resolved report
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReportResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The report has already been resolved
 */
router.patch('/:id', audit(ACTIONS.REPORT_RESOLVE, 'report'), protect, validate({ params: idParamSchema, body: moderateReportSchema }), reportController.moderateReport);

export default router;
