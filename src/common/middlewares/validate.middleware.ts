import type { RequestHandler } from 'express';
import type { ObjectSchema } from 'joi';
import { ApiError } from '../utils/utils';

interface Schemas {
    params?: ObjectSchema;
    query?: ObjectSchema;
    body?: ObjectSchema;
}

// Validates the given request parts with Joi and replaces them with the sanitized values
export const validate =
    (schemas: Schemas): RequestHandler =>
    (req, _res, next) => {
        for (const part of ['params', 'query', 'body'] as const) {
            const schema = schemas[part];
            if (!schema) continue;

            const { value, error } = schema.validate(req[part] ?? {}, { abortEarly: false, stripUnknown: true });
            if (error) {
                const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
                throw new ApiError(400, 'Validation failed', details);
            }
            // req.query is a read-only getter in Express 5, so define the property instead of assigning
            Object.defineProperty(req, part, { value, writable: true, configurable: true, enumerable: true });
        }
        next();
    };
