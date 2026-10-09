import Joi from 'joi';
import { COLLEGE_SORTS, SORT_ORDERS } from '../interfaces/college.interface';

const name = Joi.string().trim().min(2).max(150);
const city = Joi.string().trim().min(2).max(80);
const state = Joi.string().trim().min(2).max(80);
const description = Joi.string().trim().max(2000).allow('');

export const createCollegeSchema = Joi.object({
    name: name.required(),
    city: city.required(),
    state: state.required(),
    description: description.default(''),
});

export const updateCollegeSchema = Joi.object({ name, city, state, description }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

export const listCollegesQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().trim().max(50),
    city: Joi.string().trim().max(80),
    state: Joi.string().trim().max(80),
    minRating: Joi.number().min(1).max(5),
    sort: Joi.string()
        .valid(...COLLEGE_SORTS)
        .default('newest'),
    order: Joi.string().valid(...SORT_ORDERS),
});
