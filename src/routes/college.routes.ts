import { Router } from 'express';

import { PERMISSIONS } from '../common/constants/permissions';
import { ACTIONS } from '../common/constants/actions';
import { audit } from '../common/middlewares/audit.middleware';
import * as collegeController from '../controllers/college.controller';
import { validate } from '../common/middlewares/validate.middleware';
import { imageUpload, uploadLimiter } from '../common/middlewares/upload.middleware';
import { idParamSchema } from '../common/validators/user.validator';
import { protect, requirePermission } from '../common/middlewares/auth.middleware';
import { createCollegeSchema, listCollegesQuerySchema, updateCollegeSchema } from '../common/validators/college.validator';

const router = Router();

/**
 * @openapi
 * /colleges:
 *   get:
 *     tags: [Colleges]
 *     summary: List colleges with their average rating and review count
 *     description: >
 *       Public. `averageRating` and `reviewCount` are calculated from the reviews each time, so they are always current.
 *       A college with no reviews has `averageRating: null` and `reviewCount: 0`.
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - name: search
 *         in: query
 *         description: Case-insensitive match on name, city or description
 *         schema: { type: string, maxLength: 50 }
 *       - name: city
 *         in: query
 *         schema: { type: string, example: Chennai }
 *       - name: state
 *         in: query
 *         schema: { type: string, example: Tamil Nadu }
 *       - name: minRating
 *         in: query
 *         description: Only colleges whose average rating is at least this (leaves out colleges with no reviews)
 *         schema: { type: number, minimum: 1, maximum: 5, example: 4 }
 *       - name: sort
 *         in: query
 *         description: "`rating` = best rated first, `reviews` = most reviewed first"
 *         schema: { type: string, enum: [newest, name, rating, reviews], default: newest }
 *       - name: order
 *         in: query
 *         description: Direction. Leave out for the natural one (names A-Z; everything else highest or newest first). Unrated colleges are always last when sorting by rating.
 *         schema: { type: string, enum: [asc, desc] }
 *     responses:
 *       200:
 *         description: One page of colleges
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
 *                     colleges:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/College'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.get('/', validate({ query: listCollegesQuerySchema }), collegeController.listColleges);

/**
 * @openapi
 * /colleges/{id}:
 *   get:
 *     tags: [Colleges]
 *     summary: Get one college with its average rating and review count
 *     description: Public. Use `GET /reviews?college={id}` for the reviews themselves.
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The college
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollegeResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', validate({ params: idParamSchema }), collegeController.getCollege);

/**
 * @openapi
 * /colleges:
 *   post:
 *     tags: [Colleges]
 *     summary: Add a college
 *     description: Requires `college:create`. Names are unique, ignoring upper and lower case.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCollegeRequest'
 *     responses:
 *       201:
 *         description: College created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollegeResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post(
    '/',
    audit(ACTIONS.COLLEGE_CREATE, 'college'),
    protect,
    requirePermission(PERMISSIONS.COLLEGE_CREATE),
    validate({ body: createCollegeSchema }),
    collegeController.createCollege,
);

/**
 * @openapi
 * /colleges/{id}:
 *   patch:
 *     tags: [Colleges]
 *     summary: Edit a college
 *     description: Requires `college:update`. Send only the fields you want to change.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCollegeRequest'
 *     responses:
 *       200:
 *         description: The updated college
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollegeResponse'
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
router.patch(
    '/:id',
    audit(ACTIONS.COLLEGE_UPDATE, 'college'),
    protect,
    requirePermission(PERMISSIONS.COLLEGE_UPDATE),
    validate({ params: idParamSchema, body: updateCollegeSchema }),
    collegeController.updateCollege,
);

/**
 * @openapi
 * /colleges/{id}/image:
 *   put:
 *     tags: [Colleges]
 *     summary: Upload or replace a college's picture
 *     description: >
 *       Requires `college:update`. Send the picture as a multipart form. It is stored with the image storage
 *       service; the college's `image` field is the address to show it from. Uploading again replaces it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: The picture of the college. JPG, PNG or WebP, 5 MB at most.
 *     responses:
 *       200:
 *         description: The college, with the new `image` address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollegeResponse'
 *       400:
 *         description: No file was sent, it is larger than 5 MB, or it is not a JPG, PNG or WebP picture
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Validation failed
 *               errors: [{ field: image, message: 'The picture must be 5 MB or smaller' }]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         description: More than 30 uploads from this IP in 15 minutes
 *       502:
 *         description: The image storage service could not store the picture
 *       503:
 *         description: Picture uploads are not set up on this server (the CLOUDINARY_* settings are missing)
 */
router.put(
    '/:id/image',
    audit(ACTIONS.COLLEGE_UPDATE, 'college'),
    protect,
    requirePermission(PERMISSIONS.COLLEGE_UPDATE),
    validate({ params: idParamSchema }),
    uploadLimiter,
    imageUpload,
    collegeController.uploadCollegeImage,
);

/**
 * @openapi
 * /colleges/{id}/image:
 *   delete:
 *     tags: [Colleges]
 *     summary: Remove a college's picture
 *     description: Requires `college:update`. Succeeds whether or not there was a picture.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IdParam'
 *     responses:
 *       200:
 *         description: The college, with `image` now null
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollegeResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
    '/:id/image',
    audit(ACTIONS.COLLEGE_UPDATE, 'college'),
    protect,
    requirePermission(PERMISSIONS.COLLEGE_UPDATE),
    validate({ params: idParamSchema }),
    collegeController.removeCollegeImage,
);

/**
 * @openapi
 * /colleges/{id}:
 *   delete:
 *     tags: [Colleges]
 *     summary: Delete a college and all of its reviews
 *     description: Requires `college:delete`.
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
router.delete(
    '/:id',
    audit(ACTIONS.COLLEGE_DELETE, 'college'),
    protect,
    requirePermission(PERMISSIONS.COLLEGE_DELETE),
    validate({ params: idParamSchema }),
    collegeController.deleteCollege,
);

export default router;
