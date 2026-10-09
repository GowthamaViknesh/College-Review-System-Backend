export const ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES = Object.values(ROLES);

// Roles a user may pick when self-registering; admins are created via seed only
export const SELF_REGISTER_ROLES: Role[] = [ROLES.TEACHER, ROLES.STUDENT];
