import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import logger from '../config/logger';
import { ApiError, type ErrorDetail } from '../utils/utils';

export const notFound: RequestHandler = (req) => {
    throw new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`);
};

// Single place that turns any thrown error into a consistent JSON response
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    let statusCode = 500;
    let message = 'Internal server error';
    let details: ErrorDetail[] | undefined;

    if (err instanceof ApiError) {
        ({ statusCode, message, details } = err);
    } else if (err instanceof mongoose.Error.ValidationError) {
        statusCode = 400;
        message = 'Validation failed';
        details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    } else if (err instanceof mongoose.Error.CastError) {
        statusCode = 400;
        message = `Invalid ${err.path}`;
    } else if (err?.code === 11000) {
        // MongoDB duplicate key (unique index violation)
        const field = Object.keys(err.keyValue ?? {})[0] ?? 'value';
        statusCode = 409;
        message = `${field} already exists`;
    } else if (err instanceof jwt.TokenExpiredError) {
        statusCode = 401;
        message = 'Token expired';
    } else if (err instanceof jwt.JsonWebTokenError) {
        statusCode = 401;
        message = 'Invalid token';
    } else if (err?.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Malformed JSON body';
    }

    // Unexpected errors are logged in full but never leaked to the client
    if (statusCode >= 500) logger.error({ err }, 'Unhandled error');

    // Lets the action log record why a request was refused
    res.locals.errorMessage = message;

    res.status(statusCode).json({ success: false, message, ...(details && { errors: details }) });
};
