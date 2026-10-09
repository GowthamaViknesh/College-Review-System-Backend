import { Router } from 'express';

import { protect } from '../common/middlewares/auth.middleware';
import * as statsController from '../controllers/stats.controller';

const router = Router();

/**
 * @openapi
 * /stats/overview:
 *   get:
 *     tags: [Stats]
 *     summary: Figures for the dashboard
 *     description: >
 *       Any logged-in user. Returns totals, the number of reviews written on each of the last 7 days (UTC),
 *       and how many reviews gave each rating. Days and ratings with no reviews are included with a count of 0.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/StatsOverview'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/overview', protect, statsController.getOverview);

export default router;
