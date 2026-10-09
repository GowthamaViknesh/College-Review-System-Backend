import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import { ACTIONS } from '../common/constants/actions';
import { audit } from '../common/middlewares/audit.middleware';
import * as reviewController from '../controllers/review.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { idParamSchema } from '../common/validators/user.validator';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { createReviewSchema, listReviewsQuerySchema, updateReviewSchema } from '../common/validators/review.validator';

const router = Router();

/**
 * @openapi
 * /reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews
 *     description: Public. Filter by college to get one college's reviews, or by user to get everything one person wrote.
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - name: college
 *         in: query
 *         description: College id
 *         schema: { type: string }
 *       - name: user
 *         in: query
 *         description: Author's user id
 *         schema: { type: string }
 *       - name: minRating
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *       - name: maxRating
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *       - name: search
 *         in: query
 *         description: Case-insensitive match on the comment text
 *         schema: { type: string, maxLength: 50 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, enum: [newest, oldest, highest, lowest], default: newest }
 *     responses:
 *       200:
 *         description: One page of reviews
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
 *                     reviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Review'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', validate({ query: listReviewsQuerySchema }), reviewController.listReviews);

/**
 * @openapi
 * /reviews/{id}:
 *   get:
 *     tags: [Reviews]
 *     summary: Get one review
 *     description: Public.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The review
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', validate({ params: idParamSchema }), reviewController.getReview);

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Review a college
 *     description: >
 *       Requires `review:create`, which the `student` role has. Each person can review a college once;
 *       a second attempt returns 409. The college's average rating reflects the new review immediately.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateReviewRequest'
 *     responses:
 *       201:
 *         description: Review created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: The college does not exist
 *       409:
 *         description: You have already reviewed this college
 */
router.post(
    '/',
    audit(ACTIONS.REVIEW_CREATE, 'review'),
    protect,
    requirePermission(PERMISSIONS.REVIEW_CREATE),
    validate({ body: createReviewSchema }),
    reviewController.createReview,
);

/**
 * @openapi
 * /reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Edit your own review
 *     description: >
 *       Requires `review:create`, and the review must be yours. Nobody can edit another person's review,
 *       whatever their role. Only the rating and comment can change.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateReviewRequest'
 *     responses:
 *       200:
 *         description: The updated review
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewResponse'
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
    '/:id',
    audit(ACTIONS.REVIEW_UPDATE, 'review'),
    protect,
    requirePermission(PERMISSIONS.REVIEW_CREATE),
    validate({ params: idParamSchema, body: updateReviewSchema }),
    reviewController.updateReview,
);

/**
 * @openapi
 * /reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review
 *     description: You can always delete your own review. Deleting someone else's requires `review:delete:any`.
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
router.delete('/:id', audit(ACTIONS.REVIEW_DELETE, 'review'), protect, validate({ params: idParamSchema }), reviewController.deleteReview);

export default router;
