import Joi from 'joi';

const name = Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z][a-z0-9_-]{1,29}$/)
    .messages({
        'string.pattern.base': '{{#label}} must be 2-30 characters: lowercase letters, numbers, "-" or "_", starting with a letter',
    });
const description = Joi.string().trim().max(200).allow('');
// Permission names such as "review:create"; the service checks that each one exists
const permissions = Joi.array().items(Joi.string().trim().max(50)).unique().max(100);

export const createRoleSchema = Joi.object({
    name: name.required(),
    description: description.default(''),
    permissions: permissions.default([]),
});

export const updateRoleSchema = Joi.object({
    name,
    description,
    permissions,
})
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' });
