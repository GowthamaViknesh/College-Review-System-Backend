import Joi from 'joi';
import { DEFAULT_ROLE } from '../constants/roles';
import { PUBLIC_ID_PATTERN } from '../utils/utils';

const email = Joi.string().trim().lowercase().email().max(254);
const roleName = Joi.string().trim().lowercase().max(30);

export const publicId = Joi.string().pattern(PUBLIC_ID_PATTERN).messages({ 'string.pattern.base': '{{#label}} must be a valid id' });

export const idParamSchema = Joi.object({
    id: publicId.required(),
});

const username = Joi.string().trim().min(3).max(30);
const password = Joi.string().min(8).max(72);

export const registerSchema = Joi.object({
    username: username.required(),
    email: email.required(),
    password: password.required(),
    college: publicId.required(),
    role: Joi.forbidden().messages({ 'any.unknown': 'A role cannot be chosen when registering' }),
});

export const createUserSchema = Joi.object({
    username: username.required(),
    email: email.required(),
    password: password.required(),
    role: roleName.default(DEFAULT_ROLE),
    college: publicId,
});

export const updateProfileSchema = Joi.object({ username, email }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

export const updateUserSchema = Joi.object({ username, email, college: publicId }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password.required().invalid(Joi.ref('currentPassword')).messages({ 'any.invalid': '{{#label}} must be different from the current password' }),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().max(200).required(),
});

export const forgotPasswordSchema = Joi.object({
    email: email.required(),
});

const resetCode = Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .messages({ 'string.pattern.base': '{{#label}} must be the 6 digits from the email' });

export const verifyResetCodeSchema = Joi.object({
    email: email.required(),
    code: resetCode.required(),
});

export const resetPasswordSchema = Joi.object({
    resetToken: Joi.string().max(200).required(),
    newPassword: password.required(),
});

export const loginSchema = Joi.object({
    email: email.required(),
    password: Joi.string().required(),
});

export const listUsersQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    role: roleName,
    college: publicId,
    search: Joi.string().trim().max(50),
});

export const assignRoleSchema = Joi.object({
    role: roleName.required(),
});
