import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

import { ALL_ACTIONS } from '../constants/actions';
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
            '**Public endpoints:** register, login, and reading colleges and reviews. Everything else needs a token.',
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
        { name: 'Colleges', description: 'Colleges, each with an average rating calculated from its reviews' },
        { name: 'Reviews', description: 'Ratings and comments written by students' },
        { name: 'Action logs', description: 'A read-only record of who did what' },
        { name: 'Stats', description: 'Summary figures for the dashboard' },
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
                description: "The record's public id: its userId, roleId, collegeId or reviewId (16 letters and digits)",
                schema: { type: 'string', pattern: '^[0-9A-Za-z]{16}$', example: 'h3Fq8ZsN1yUd6RoE' },
            },
        },
        schemas: {
            PermissionName: { type: 'string', enum: ALL_PERMISSIONS, example: 'review:create' },
            RoleSummary: {
                type: 'object',
                properties: {
                    roleId: { type: 'string', example: 'Xb4mQ9tLw2Rk7ZpA' },
                    name: { type: 'string', example: 'student' },
                },
            },
            User: {
                type: 'object',
                properties: {
                    userId: { type: 'string', example: 'T7nKp2LmQ9xWc4Vb', description: 'Use this wherever a user id is asked for' },
                    username: { type: 'string', example: 'gowtham' },
                    email: { type: 'string', format: 'email', example: 'gowtham@example.com' },
                    role: { $ref: '#/components/schemas/RoleSummary' },
                    avatar: {
                        type: 'string',
                        format: 'uri',
                        nullable: true,
                        example: 'https://res.cloudinary.com/demo/image/upload/v1/college-reviews/avatars/T7nKp2LmQ9xWc4Vb.jpg',
                        description: 'Address of the profile picture; null if none was uploaded',
                    },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Role: {
                type: 'object',
                properties: {
                    roleId: { type: 'string', example: 'Xb4mQ9tLw2Rk7ZpA' },
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
            College: {
                type: 'object',
                properties: {
                    collegeId: { type: 'string', example: 'h3Fq8ZsN1yUd6RoE' },
                    name: { type: 'string', example: 'Anna University' },
                    city: { type: 'string', example: 'Chennai' },
                    state: { type: 'string', example: 'Tamil Nadu' },
                    description: { type: 'string', example: 'Public state university founded in 1978' },
                    image: {
                        type: 'string',
                        format: 'uri',
                        nullable: true,
                        example: 'https://res.cloudinary.com/demo/image/upload/v1/college-reviews/colleges/h3Fq8ZsN1yUd6RoE.jpg',
                        description: 'Address of the picture of the college; null if none was uploaded',
                    },
                    createdBy: {
                        type: 'string',
                        nullable: true,
                        example: 'T7nKp2LmQ9xWc4Vb',
                        description: 'userId of whoever added the college; null if that account was deleted',
                    },
                    averageRating: { type: 'number', nullable: true, example: 4.3, description: 'Mean of all review ratings, 1 decimal; null with no reviews' },
                    reviewCount: { type: 'integer', example: 12 },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Review: {
                type: 'object',
                properties: {
                    reviewId: { type: 'string', example: 'M5cJx0PaG8vTe2Wn' },
                    college: {
                        type: 'object',
                        properties: { collegeId: { type: 'string', example: 'h3Fq8ZsN1yUd6RoE' }, name: { type: 'string', example: 'Anna University' } },
                    },
                    user: {
                        type: 'object',
                        properties: {
                            userId: { type: 'string', example: 'T7nKp2LmQ9xWc4Vb' },
                            username: { type: 'string', example: 'gowtham' },
                            avatar: { type: 'string', format: 'uri', nullable: true },
                        },
                    },
                    rating: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
                    comment: { type: 'string', example: 'Good faculty and placements, but the hostel needs work.' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            CreateCollegeRequest: {
                type: 'object',
                required: ['name', 'city', 'state'],
                properties: {
                    name: { type: 'string', minLength: 2, maxLength: 150, example: 'Anna University' },
                    city: { type: 'string', example: 'Chennai' },
                    state: { type: 'string', example: 'Tamil Nadu' },
                    description: { type: 'string', maxLength: 2000, example: 'Public state university founded in 1978' },
                },
            },
            UpdateCollegeRequest: {
                type: 'object',
                minProperties: 1,
                properties: {
                    name: { type: 'string', example: 'Anna University, Chennai' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    description: { type: 'string' },
                },
            },
            CreateReviewRequest: {
                type: 'object',
                required: ['college', 'rating', 'comment'],
                properties: {
                    college: { type: 'string', description: "The college's collegeId", example: 'h3Fq8ZsN1yUd6RoE' },
                    rating: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
                    comment: { type: 'string', minLength: 10, maxLength: 2000, example: 'Good faculty and placements, but the hostel needs work.' },
                },
            },
            UpdateReviewRequest: {
                type: 'object',
                minProperties: 1,
                properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                    comment: { type: 'string', minLength: 10, maxLength: 2000, example: 'Updated after my final year: placements were excellent.' },
                },
            },
            CollegeResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { college: { $ref: '#/components/schemas/College' } } },
                },
            },
            ReviewResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object', properties: { review: { $ref: '#/components/schemas/Review' } } },
                },
            },
            ActionName: { type: 'string', enum: ALL_ACTIONS, example: 'role:assign' },
            ActionLog: {
                type: 'object',
                properties: {
                    logId: { type: 'string', example: 'u9Ld3BkY6sHq1ZfC' },
                    actor: {
                        type: 'object',
                        description: 'Who did it. Both fields are null when nobody was logged in, e.g. a failed login.',
                        properties: {
                            id: { type: 'string', nullable: true, example: 'T7nKp2LmQ9xWc4Vb' },
                            username: { type: 'string', nullable: true, example: 'admin' },
                        },
                    },
                    action: { $ref: '#/components/schemas/ActionName' },
                    outcome: { type: 'string', enum: ['success', 'denied', 'failed'], example: 'success' },
                    target: {
                        type: 'object',
                        description: 'What it was done to',
                        properties: {
                            type: { type: 'string', enum: ['user', 'role', 'college', 'review'], example: 'user' },
                            id: { type: 'string', nullable: true, example: 'Rw6Ht1NcJ4kPz8Ys' },
                        },
                    },
                    details: { type: 'object', description: 'Facts specific to the action; includes "reason" when it was refused', example: { role: 'teacher' } },
                    ip: { type: 'string', nullable: true, example: '203.0.113.7' },
                    method: { type: 'string', example: 'PATCH' },
                    path: { type: 'string', example: '/api/v1/users/Rw6Ht1NcJ4kPz8Ys/role' },
                    statusCode: { type: 'integer', example: 200 },
                    createdAt: { type: 'string', format: 'date-time' },
                },
            },
            StatsOverview: {
                type: 'object',
                properties: {
                    totals: {
                        type: 'object',
                        properties: {
                            colleges: { type: 'integer', example: 5 },
                            reviews: { type: 'integer', example: 16 },
                            averageRating: { type: 'number', nullable: true, example: 4.2, description: 'Mean of every review; null with no reviews' },
                            myReviews: { type: 'integer', example: 3, description: 'Reviews written by the logged-in user' },
                        },
                    },
                    reviewsPerDay: {
                        type: 'array',
                        description: 'The last 7 days, oldest first',
                        items: {
                            type: 'object',
                            properties: { date: { type: 'string', example: '2026-10-09' }, count: { type: 'integer', example: 4 } },
                        },
                    },
                    ratingDistribution: {
                        type: 'array',
                        description: 'Ratings 1 to 5, in order',
                        items: {
                            type: 'object',
                            properties: { rating: { type: 'integer', example: 5 }, count: { type: 'integer', example: 6 } },
                        },
                    },
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
            UpdateProfileRequest: {
                type: 'object',
                minProperties: 1,
                properties: {
                    username: { type: 'string', minLength: 3, maxLength: 30, example: 'gowtham' },
                    email: { type: 'string', format: 'email', example: 'gowtham@example.com' },
                },
            },
            ChangePasswordRequest: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string', example: 'Password@123' },
                    newPassword: { type: 'string', minLength: 8, maxLength: 72, example: 'NewPassword@456' },
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
                            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'Access token; short-lived' },
                            refreshToken: { type: 'string', example: 'q3J0b2tlbi1leGFtcGxlLW9ubHktbm90LXJlYWwtdG9rZW4', description: 'Exchange at POST /auth/refresh; works once' },
                        },
                    },
                },
            },
            RefreshTokenRequest: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string', example: 'q3J0b2tlbi1leGFtcGxlLW9ubHktbm90LXJlYWwtdG9rZW4' } },
            },
            TokensResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                        type: 'object',
                        properties: {
                            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'Access token; short-lived' },
                            refreshToken: { type: 'string', example: 'bmV4dC1yZWZyZXNoLXRva2VuLWV4YW1wbGUtb25seQ', description: 'Replaces the one that was sent' },
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
