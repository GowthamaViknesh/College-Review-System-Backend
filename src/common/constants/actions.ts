export const ACTIONS = {
    AUTH_REGISTER: 'auth:register',
    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_PASSWORD_CHANGE: 'auth:password_change',
    AUTH_PASSWORD_RESET_REQUEST: 'auth:password_reset_request',
    AUTH_PASSWORD_RESET: 'auth:password_reset',
    PROFILE_UPDATE: 'profile:update',

    USER_CREATE: 'user:create',
    USER_UPDATE: 'user:update',
    USER_DELETE: 'user:delete',

    ROLE_CREATE: 'role:create',
    ROLE_UPDATE: 'role:update',
    ROLE_DELETE: 'role:delete',
    ROLE_ASSIGN: 'role:assign',

    COLLEGE_CREATE: 'college:create',
    COLLEGE_UPDATE: 'college:update',
    COLLEGE_DELETE: 'college:delete',

    REVIEW_CREATE: 'review:create',
    REVIEW_UPDATE: 'review:update',
    REVIEW_DELETE: 'review:delete',
    REVIEW_UPVOTE: 'review:upvote',
    REVIEW_UPVOTE_REMOVE: 'review:upvote:remove',
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];
export const ALL_ACTIONS = Object.values(ACTIONS);

export const OUTCOMES = ['success', 'denied', 'failed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const TARGET_TYPES = ['user', 'role', 'college', 'review'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];
