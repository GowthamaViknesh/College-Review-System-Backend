import Joi from 'joi';
import { DEFAULT_ROLE } from '../constants/roles';
import { PUBLIC_ID_PATTERN } from '../utils/public-id';

const email = Joi.string().trim().lowercase().email().max(254);
// Roles are stored in the database, so here we only check the shape; services check that the role exists
const roleName = Joi.string().trim().lowercase().max(30);

// The public id of a record (userId, collegeId and so on): 16 letters and digits
export const publicId = Joi.string().pattern(PUBLIC_ID_PATTERN).messages({ 'string.pattern.base': '{{#label}} must be a valid id' });

export const idParamSchema = Joi.object({
    id: publicId.required(),
});

const username = Joi.string().trim().min(3).max(30);
// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated
const password = Joi.string().min(8).max(72);

export const registerSchema = Joi.object({
    username: username.required(),
    email: email.required(),
    password: password.required(),
    // Said out loud rather than silently ignored: people who sign up themselves cannot pick a role
    role: Joi.forbidden().messages({ 'any.unknown': 'A role cannot be chosen when registering' }),
});

// An existing user creating an account for someone else
export const createUserSchema = Joi.object({
    username: username.required(),
    email: email.required(),
    password: password.required(),
    role: roleName.default(DEFAULT_ROLE),
});

// Changing your own details: only the fields sent are changed. The role is not here; that needs role:assign.
export const updateProfileSchema = Joi.object({ username, email }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

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
    // What entering the code correctly returned
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
    search: Joi.string().trim().max(50),
});

export const assignRoleSchema = Joi.object({
    role: roleName.required(),
});
