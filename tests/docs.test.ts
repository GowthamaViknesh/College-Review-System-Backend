import request from 'supertest';
import app from '../src/app';

describe('API documentation', () => {
    it('serves the Swagger UI page', async () => {
        const res = await request(app).get('/api-docs/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('swagger-ui');
    });

    it('documents every endpoint', async () => {
        const res = await request(app).get('/api-docs.json');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toBe('3.0.3');

        const documented = Object.entries<Record<string, unknown>>(res.body.paths)
            .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
            .sort();

        // Adding a route? Add its @openapi block above it, then list it here.
        expect(documented).toEqual(
            [
                'POST /auth/register',
                'POST /auth/login',
                'POST /auth/refresh',
                'POST /auth/logout',
                'POST /auth/forgot-password',
                'POST /auth/verify-reset-code',
                'POST /auth/reset-password',
                'GET /auth/me',
                'PATCH /auth/me',
                'PATCH /auth/me/password',
                'PUT /auth/me/avatar',
                'DELETE /auth/me/avatar',
                'POST /users',
                'GET /users',
                'GET /users/{id}',
                'PATCH /users/{id}',
                'PUT /users/{id}/avatar',
                'DELETE /users/{id}/avatar',
                'PATCH /users/{id}/role',
                'DELETE /users/{id}',
                'GET /roles',
                'GET /roles/{id}',
                'POST /roles',
                'PATCH /roles/{id}',
                'DELETE /roles/{id}',
                'GET /permissions',
                'GET /colleges',
                'GET /colleges/{id}',
                'POST /colleges',
                'PATCH /colleges/{id}',
                'DELETE /colleges/{id}',
                'PUT /colleges/{id}/image',
                'DELETE /colleges/{id}/image',
                'GET /reviews',
                'GET /reviews/{id}',
                'POST /reviews',
                'PATCH /reviews/{id}',
                'DELETE /reviews/{id}',
                'GET /action-logs',
                'GET /stats/overview',
            ].sort(),
        );
    });

    it('marks every endpoint as needing a token, except register, login, refresh, logout, password reset and reading colleges and reviews', async () => {
        const res = await request(app).get('/api-docs.json');
        const open = Object.entries<Record<string, { security?: unknown[] }>>(res.body.paths)
            .flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method, operation })))
            .filter(({ operation }) => !operation.security)
            .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
            .sort();

        expect(open).toEqual([
            'GET /colleges',
            'GET /colleges/{id}',
            'GET /reviews',
            'GET /reviews/{id}',
            'POST /auth/forgot-password',
            'POST /auth/login',
            'POST /auth/logout',
            'POST /auth/refresh',
            'POST /auth/register',
            'POST /auth/reset-password',
            'POST /auth/verify-reset-code',
        ]);
    });
});
