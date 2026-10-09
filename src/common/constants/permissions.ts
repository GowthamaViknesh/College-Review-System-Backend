// Permissions are defined here, in code, because each one only means something if a route checks for it.
// They are not stored in their own collection: a role document simply lists the names it grants.
// Roles (which group permissions) are the dynamic part and are managed through the API.
export const PERMISSIONS = {
    USER_READ: 'user:read',
    USER_READ_COLLEGE: 'user:read:college',
    USER_CREATE: 'user:create',
    USER_UPDATE: 'user:update',
    USER_DELETE: 'user:delete',

    ROLE_READ: 'role:read',
    ROLE_CREATE: 'role:create',
    ROLE_UPDATE: 'role:update',
    ROLE_DELETE: 'role:delete',
    ROLE_ASSIGN: 'role:assign',

    COLLEGE_CREATE: 'college:create',
    COLLEGE_UPDATE: 'college:update',
    COLLEGE_DELETE: 'college:delete',

    REVIEW_CREATE: 'review:create',
    REVIEW_DELETE_ANY: 'review:delete:any',

    LOG_READ: 'log:read',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionName, string> = {
    'user:read': 'View every user and their details',
    'user:read:college': 'View the students of your own college only',
    'user:create': 'Create student accounts in your own college (any role and any college also needs role:assign)',
    'user:update': "Edit another user's username, email and picture (for anyone but a student this also needs role:assign)",
    'user:delete': 'Delete user accounts',
    'role:read': 'View roles and the permissions catalogue',
    'role:create': 'Create custom roles',
    'role:update': 'Edit a role and the permissions it grants',
    'role:delete': 'Delete custom roles',
    'role:assign': 'Change which role a user has and which college they belong to',
    'college:create': 'Add colleges',
    'college:update': 'Edit colleges',
    'college:delete': 'Delete colleges',
    'review:create': 'Write one review per college, and edit your own',
    'review:delete:any': "Delete any user's review (moderation)",
    'log:read': 'View the action log: who did what, and what was refused',
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// What GET /permissions returns: everything that can be granted to a role
export const PERMISSION_CATALOGUE = [...ALL_PERMISSIONS].sort().map((name) => ({
    name,
    resource: name.split(':')[0],
    description: PERMISSION_DESCRIPTIONS[name],
}));

export function isPermission(name: string): name is PermissionName {
    return (ALL_PERMISSIONS as string[]).includes(name);
}
