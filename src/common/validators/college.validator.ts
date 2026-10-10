import Joi from 'joi';
import { COLLEGE_SORTS, SORT_ORDERS } from '../interfaces/college.interface';

const name = Joi.string().trim().min(2).max(150);
const country = Joi.string().trim().min(2).max(80);
const state = Joi.string().trim().min(2).max(80);
const city = Joi.string().trim().min(2).max(80);
const address = Joi.string().trim().max(300).allow('');
const description = Joi.string().trim().max(2000).allow('');

export const createCollegeSchema = Joi.object({
    name: name.required(),
    country: country.required(),
    state: state.required(),
    city: city.required(),
    address: address.default(''),
    description: description.default(''),
});

export const updateCollegeSchema = Joi.object({ name, country, state, city, address, description }).min(1).messages({ 'object.min': 'Provide at least one field to update' });

export const listCollegesQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().trim().max(50),
    country: Joi.string().trim().max(80),
    state: Joi.string().trim().max(80),
    city: Joi.string().trim().max(80),
    minRating: Joi.number().min(1).max(5),
    sort: Joi.string()
        .valid(...COLLEGE_SORTS)
        .default('newest'),
    order: Joi.string().valid(...SORT_ORDERS),
});
