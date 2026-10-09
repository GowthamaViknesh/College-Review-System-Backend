import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

import { ALL_PERMISSIONS } from '../constants/permissions';

const errorResponse = (description: string, message: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { success: false, message } } },
});

// Everything shared between endpoints lives here. The endpoints themselves are documented
// in @openapi comment blocks directly above each route in src/routes/*.ts.
const definition = {
    openapi: '3.0.3',
    info: {
        title: 'College Review System API',
        version: '1.0.0',
        description: [
            'REST API for reviewing colleges, with JWT authentication and role-based access control.',
            '',
            '**Trying it out:** call `POST /auth/login`, copy `data.token` from the response, click **Authorize** and paste it in.',
            '',
            '**Access control:** every user has one role, and a role is a list of permissions. Each protected endpoint',
            'below states the permission it needs. Roles are managed through the `/roles` endpoints; the `admin` role',
            'always has every permission and cannot be changed.',
        ].join('\n'),
    },
    servers: [{ url: '/api/v1', description: 'Version 1' }],
    tags: [
        { name: 'Auth', description: 'Sign up, log in and see who you are' },
        { name: 'Users', description: 'Manage user accounts' },
        { name: 'Roles', description: 'Manage roles and the permissions they grant' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        parameters: {
            IdParam: {
                name: 'id',
                in: 'path',
                required: true,
                description: 'MongoDB ObjectId',
                schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', example: '66f1a2b3c4d5e6f7a8b9c0d1' },
            },
        },
        schemas: {
            PermissionName: { type: 'string', enum: ALL_PERMISSIONS, example: 'review:create' },
            RoleSummary: {
                type: 'object',
                properties: {
                    _id: { type: 'string', example: '66f1a2b3c4d5e6f7a8b9c0d1' },
                    name: { type: 'string', example: 'student' },
                },
            },
            User: {
                type: 'object',
                properties: {
                    _id: { type: 'string', example: '66f1a2b3c4d5e6f7a8b9c0d2' },
                    username: { type: 'string', example: 'gowtham' },
                    email: { type: 'string', format: 'email', example: 'gowtham@example.com' },
                    role: { $ref: '#/components/schemas/RoleSummary' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Role: {
                type: 'object',
                properties: {
                    _id: { type: 'string', example: '66f1a2b3c4d5e6f7a8b9c0d1' },
                    name: { type: 'string', example: 'teacher' },
                    description: { type: 'string', example: 'Can add and edit colleges and write reviews' },
                    permissions: { type: 'array', items: { $ref: '#/components/schemas/PermissionName' } },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Permission: {
                type: 'object',
                properties: {
                    name: { $ref: '#/components/schemas/PermissionName' },
                    resource: { type: 'string', example: 'review' },
                    description: { type: 'string', example: 'Write reviews, and edit or delete your own' },
                },
            },
            PaginationMeta: {
                type: 'object',
                properties: {
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 10 },
                    total: { type: 'integer', example: 42 },
                    totalPages: { type: 'integer', example: 5 },
                },
            },
            RegisterRequest: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3, maxLength: 30, example: 'gowtham' },
                    email: { type: 'string', format: 'email', example: 'gowtham@example.com' },
                    password: { type: 'string', minLength: 8, maxLength: 72, example: 'Password@123' },
                },
            },
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'admin@example.com' },
                    password: { type: 'string', example: 'Password@123' },
                },
            },
            CreateUserRequest: {
                allOf: [
                    { $ref: '#/components/schemas/RegisterRequest' },
                    {
                        type: 'object',
                        properties: {
                            role: { type: 'string', default: 'student', example: 'teacher', description: 'Name of an existing role' },
                        },
                    },
                ],
            },
            AssignRoleRequest: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', example: 'teacher', description: 'Name of an existing role' } },
            },
            CreateRoleRequest: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: {
                        type: 'string',
                        pattern: '^[a-z][a-z0-9_-]{1,29}$',
                        example: 'moderator',
                        description: '2-30 characters: lowercase letters, numbers, "-" or "_", starting with a letter',
                    },
                    description: { type: 'string', maxLength: 200, example: 'Removes abusive reviews' },
                    permissions: { type: 'array', items: { $ref: '#/components/schemas/PermissionName' }, example: ['review:delete:any'] },
                },
            },
            UpdateRoleRequest: {
                type: 'object',
                minProperties: 1,
                description: 'Send only the fields you want to change. `permissions` replaces the whole list.',
                properties: {
                    name: { type: 'string', example: 'senior-moderator' },
                    description: { type: 'string', example: 'Removes abusive reviews and manages colleges' },
                    permissions: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/PermissionName' },
                        example: ['review:delete:any', 'college:update'],
                    },
                },
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                        type: 'object',
                        properties: {
                            user: { $ref: '#/components/schemas/User' },
                            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        },
                    },
                },
            },
            UserResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
                },
            },
            RoleResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { role: { $ref: '#/components/schemas/Role' } } },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Validation failed' },
                    errors: {
                        type: 'array',
                        description: 'Only present for validation errors',
                        items: {
                            type: 'object',
                            properties: {
                                field: { type: 'string', example: 'email' },
                                message: { type: 'string', example: '"email" must be a valid email' },
                            },
                        },
                    },
                },
            },
        },
        responses: {
            ValidationError: {
                description: 'The request body, query or path parameters are invalid',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Error' },
                        example: {
                            success: false,
                            message: 'Validation failed',
                            errors: [{ field: 'email', message: '"email" must be a valid email' }],
                        },
                    },
                },
            },
            Unauthorized: errorResponse('The token is missing, invalid or expired', 'Authentication required'),
            Forbidden: errorResponse('Your role does not have the required permission', 'You do not have permission to perform this action'),
            NotFound: errorResponse('Nothing exists with that id', 'User not found'),
            Conflict: errorResponse('The request conflicts with existing data', 'email already exists'),
            TooManyRequests: errorResponse('More than 20 attempts from this IP in 15 minutes', 'Too many attempts, please try again later'),
        },
    },
};

// Reads the @openapi blocks from the route files: .ts when running from source, .js from the compiled build.
// swagger-jsdoc expects forward slashes in the glob, including on Windows.
const routeFiles = path.join(__dirname, '../../routes/*.{ts,js}').replace(/\\/g, '/');

export const swaggerSpec = swaggerJsdoc({ definition, apis: [routeFiles] });
