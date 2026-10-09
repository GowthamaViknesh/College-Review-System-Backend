import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../common/config/env';
import { protect } from '../common/middlewares/auth.middleware';
import { validate } from '../common/middlewares/validate.middleware';
import { loginSchema, registerSchema } from '../common/validators/user.validator';
import * as authzController from '../controllers/authz.controller';

const router = Router();

// Slows down password guessing and mass sign-ups: 20 attempts per IP every 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message: 'Too many attempts, please try again later' },
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create your own account
 *     description: Public. The new account always gets the `student` role; a role cannot be chosen here.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Account created. Use the returned token to authenticate.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       503:
 *         description: Registration is closed because an admin removed the `student` role
 */
router.post('/register', authLimiter, validate({ body: registerSchema }), authzController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and get a token
 *     description: Public. After `npm run seed` you can log in as `admin@example.com` / `Password@123`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Wrong email or password (the same message for both, so emails cannot be discovered)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Invalid email or password
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/login', authLimiter, validate({ body: loginSchema }), authzController.login);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Who am I, and what am I allowed to do?
 *     description: Any logged-in user. Returns your account and the permissions your role currently grants.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The current user and their permissions
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     permissions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PermissionName'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', protect, authzController.me);

export default router;
