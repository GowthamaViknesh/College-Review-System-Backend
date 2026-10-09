import Joi from 'joi';
import { publicId } from './user.validator';
import { ALL_ACTIONS, OUTCOMES, TARGET_TYPES } from '../constants/actions';

export const listActionLogsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    actor: publicId,
    action: Joi.string().valid(...ALL_ACTIONS),
    outcome: Joi.string().valid(...OUTCOMES),
    targetType: Joi.string().valid(...TARGET_TYPES),
    targetId: publicId,
    from: Joi.date().iso(),
    to: Joi.date().iso().min(Joi.ref('from')),
});
