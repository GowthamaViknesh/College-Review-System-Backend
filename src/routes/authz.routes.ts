import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../common/config/env';
import { ACTIONS } from '../common/constants/actions';
import { audit } from '../common/middlewares/audit.middleware';
import { protect } from '../common/middlewares/auth.middleware';
import { validate } from '../common/middlewares/validate.middleware';
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from '../common/validators/user.validator';
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
router.post('/register', audit(ACTIONS.AUTH_REGISTER, 'user'), authLimiter, validate({ body: registerSchema }), authzController.register);

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
router.post('/login', audit(ACTIONS.AUTH_LOGIN, 'user'), authLimiter, validate({ body: loginSchema }), authzController.login);

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

/**
 * @openapi
 * /auth/me:
 *   patch:
 *     tags: [Auth]
 *     summary: Update your own username or email
 *     description: Any logged-in user. Send only the fields you want to change. Your role cannot be changed here.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Your updated account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.patch('/me', audit(ACTIONS.PROFILE_UPDATE, 'user'), protect, validate({ body: updateProfileSchema }), authzController.updateMe);

/**
 * @openapi
 * /auth/me/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change your own password
 *     description: >
 *       Any logged-in user. Needs the current password, so an unlocked screen is not enough to take over an account.
 *       Tokens already issued keep working until they expire.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       204:
 *         description: Password changed
 *       400:
 *         description: The current password is wrong, or the new one is too short or the same as the old one
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.patch('/me/password', audit(ACTIONS.AUTH_PASSWORD_CHANGE, 'user'), protect, authLimiter, validate({ body: changePasswordSchema }), authzController.changeMyPassword);

export default router;
