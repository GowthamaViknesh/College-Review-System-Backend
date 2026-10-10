import { PERMISSIONS, type PermissionName } from './permissions';

// Roles are data: they live in the database and are created, edited and deleted through the API.
// Only two names are known to the code.

// Always exists and always has every permission (enforced at startup), so admins can never be locked out
export const ADMIN_ROLE = 'admin';

// The role given to people who sign up themselves through POST /auth/register
export const DEFAULT_ROLE = 'student';

interface StarterRole {
    name: string;
    description: string;
    permissions: PermissionName[];
}

// Created by `npm run seed` if they do not exist yet. After that they are ordinary roles
// that an admin can change or remove like any other.
export const STARTER_ROLES: StarterRole[] = [
    {
        name: 'teacher',
        description: 'Can add and edit colleges, and create and see the students of their own college',
        // No review:create: ratings are meant to come from students, so teachers manage colleges but do not review them
        permissions: [PERMISSIONS.COLLEGE_CREATE, PERMISSIONS.COLLEGE_UPDATE, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_READ],
    },
    {
        name: DEFAULT_ROLE,
        description: 'Can write reviews',
        permissions: [PERMISSIONS.REVIEW_CREATE],
    },
];
