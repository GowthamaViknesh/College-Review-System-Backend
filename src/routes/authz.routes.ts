import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../common/config/env';
import { ACTIONS } from '../common/constants/actions';
import { audit } from '../common/middlewares/audit.middleware';
import { protect } from '../common/middlewares/auth.middleware';
import { imageUpload, uploadLimiter } from '../common/middlewares/upload.middleware';
import { validate } from '../common/middlewares/validate.middleware';
import { forgotPasswordSchema, resetPasswordSchema, verifyResetCodeSchema } from '../common/validators/user.validator';
import { changePasswordSchema, loginSchema, refreshTokenSchema, registerSchema, updateProfileSchema } from '../common/validators/user.validator';
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
 *     description: >
 *       Public. After `npm run seed` you can log in as `admin@example.com` / `Password@123`.
 *       Returns a short-lived access token (`token`, sent as `Authorization: Bearer ...` on other requests)
 *       and a refresh token for getting the next pair from `POST /auth/refresh`.
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
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Ask for a password reset code by email
 *     description: >
 *       Public. The first step of resetting a forgotten password. If the address belongs to an account, a 6-digit code is emailed to it. The code works for 10 minutes,
 *       can be tried 5 times and used once. Asking again replaces the previous code, at most once a minute per account.
 *       The answer is the same whether or not the address has an account, so this cannot be used to find out who is registered.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: admin@example.com }
 *     responses:
 *       200:
 *         description: Accepted. Says nothing about whether the account exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'If an account exists for that email, a reset code has been sent to it.' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       503:
 *         description: Sending email is not set up on this server (the SMTP_* settings are missing)
 */
router.post('/forgot-password', audit(ACTIONS.AUTH_PASSWORD_RESET_REQUEST, 'user'), authLimiter, validate({ body: forgotPasswordSchema }), authzController.forgotPassword);

/**
 * @openapi
 * /auth/verify-reset-code:
 *   post:
 *     tags: [Auth]
 *     summary: Check the emailed code and get a reset token
 *     description: >
 *       Public. The second step of resetting a forgotten password. If the code is right it stops working and a
 *       one-time `resetToken` is returned, valid for 10 minutes, to send with the new password. The password
 *       is not changed by this call. A wrong code, an expired code, a code with no tries left and an unknown
 *       address all get the same answer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email, example: admin@example.com }
 *               code: { type: string, pattern: '^\\d{6}$', example: '482913' }
 *     responses:
 *       200:
 *         description: The code was right
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken: { type: string, example: 'c2FtcGxlLXJlc2V0LXRva2VuLW5vdC1yZWFsLW9uZQ' }
 *                     expiresInMinutes: { type: integer, example: 10 }
 *       400:
 *         description: The body is invalid, or the code is wrong, expired, already used or out of tries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Validation failed
 *               errors: [{ field: code, message: 'That code is wrong or has expired. Check it, or ask for a new one.' }]
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/verify-reset-code', authLimiter, validate({ body: verifyResetCodeSchema }), authzController.verifyResetCode);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using the reset token
 *     description: >
 *       Public. The last step of resetting a forgotten password, using the token from `POST /auth/verify-reset-code`.
 *       On success the password is changed, the token stops working, and every existing login for the account
 *       is ended on every device. Log in with the new password afterwards.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken: { type: string, example: 'c2FtcGxlLXJlc2V0LXRva2VuLW5vdC1yZWFsLW9uZQ' }
 *               newPassword: { type: string, minLength: 8, maxLength: 72, example: NewPassword@456 }
 *     responses:
 *       204:
 *         description: Password changed
 *       400:
 *         description: The body is invalid, or the reset token is unknown, expired or already used
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Validation failed
 *               errors: [{ field: resetToken, message: 'This password reset has expired or was already used. Ask for a new code.' }]
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post('/reset-password', audit(ACTIONS.AUTH_PASSWORD_RESET, 'user'), authLimiter, validate({ body: resetPasswordSchema }), authzController.resetPassword);

// Refreshing is routine (every client does it each time its access token expires), so the limit is far
// looser than for logging in, while still stopping one address from guessing tokens at speed
const sessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message: 'Too many attempts, please try again later' },
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new pair of tokens
 *     description: >
 *       Public: the access token has usually expired by the time this is called. A refresh token works once.
 *       The response contains a new access token and a new refresh token, and the one that was sent stops working.
 *       If a refresh token that was already exchanged is sent again more than a few seconds later, it is treated as
 *       stolen and the whole login is ended, so both parties have to log in again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: A new access token and refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokensResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: The refresh token is unknown, expired, already used, or its login was ended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Your session has ended. Please log in again.
 *       429:
 *         description: More than 100 attempts from this IP in 15 minutes
 */
router.post('/refresh', sessionLimiter, validate({ body: refreshTokenSchema }), authzController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out
 *     description: >
 *       Public. Ends the login the refresh token belongs to, so it can no longer be refreshed; logins on other
 *       devices are not affected. Succeeds even if the token is unknown or already ended. The access token keeps
 *       working until it expires, which is why it is short-lived.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       204:
 *         description: Logged out
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         description: More than 100 attempts from this IP in 15 minutes
 */
router.post('/logout', audit(ACTIONS.AUTH_LOGOUT, 'user'), sessionLimiter, validate({ body: refreshTokenSchema }), authzController.logout);

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
 * /auth/me/avatar:
 *   put:
 *     tags: [Auth]
 *     summary: Upload or replace your profile picture
 *     description: >
 *       Any logged-in user. Send the picture as a multipart form. It is cropped to a square and stored with the
 *       image storage service; the account's `avatar` field is the address to show it from. Uploading again replaces it.
 *     security:
 *       - bearerAuth: []
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
 *                 description: Your picture. JPG, PNG or WebP, 5 MB at most.
 *     responses:
 *       200:
 *         description: Your account, with the new `avatar` address
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
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
 *       429:
 *         description: More than 30 uploads from this IP in 15 minutes
 *       502:
 *         description: The image storage service could not store the picture
 *       503:
 *         description: Picture uploads are not set up on this server (the CLOUDINARY_* settings are missing)
 */
router.put('/me/avatar', audit(ACTIONS.PROFILE_UPDATE, 'user'), protect, uploadLimiter, imageUpload, authzController.uploadMyAvatar);

/**
 * @openapi
 * /auth/me/avatar:
 *   delete:
 *     tags: [Auth]
 *     summary: Remove your profile picture
 *     description: Any logged-in user. Succeeds whether or not there was a picture.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Your account, with `avatar` now null
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/me/avatar', audit(ACTIONS.PROFILE_UPDATE, 'user'), protect, authzController.removeMyAvatar);

/**
 * @openapi
 * /auth/me/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change your own password
 *     description: >
 *       Any logged-in user. Needs the current password, so an unlocked screen is not enough to take over an account.
 *       Every existing login is ended at once, on every device: their access tokens and refresh tokens stop working.
 *       The response contains a new pair of tokens so the caller stays logged in.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed. Use the returned tokens from now on.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokensResponse'
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
