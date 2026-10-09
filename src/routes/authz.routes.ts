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

router.post('/register', authLimiter, validate({ body: registerSchema }), authzController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authzController.login);
router.get('/me', protect, authzController.me);

export default router;
