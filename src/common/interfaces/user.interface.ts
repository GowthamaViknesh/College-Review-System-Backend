import type { Types } from 'mongoose';

// A picture kept in image storage: the address to show it, and the id needed to delete it later
export interface StoredImage {
    url: string;
    publicId: string;
}

export interface IUser {
    // The id the API uses for this user. MongoDB's _id never leaves the server.
    userId: string;
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
    // The college they belong to. Every teacher and student has one; administrators, who look after all
    // colleges, do not. Accounts made before this existed have none until an administrator assigns it.
    college: Types.ObjectId | null;
    // Profile picture; null until the user uploads one
    avatar: StoredImage | null;
    // Access tokens issued before this moment are refused; null if the password was never changed
    passwordChangedAt: Date | null;
    // When they last used the site, to the nearest minute or so; null if they never have
    lastActiveAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserMethods {
    comparePassword(candidate: string): Promise<boolean>;
}

export interface UserFilter {
    role?: Types.ObjectId;
    // MongoDB's id of a college
    college?: string;
    search?: string;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
    // MongoDB's id of a college, or null for none
    college: string | null;
}

// Signing up yourself: no role (everyone starts with the default role), and the college you attend by its public id
export interface RegisterInput {
    username: string;
    email: string;
    password: string;
    college: string;
}

// An existing user creating an account for someone else. The role is referred to by name, e.g. "teacher",
// and the college by its public id; who may leave the college out is decided in the service.
export interface CreateUserRequest extends Omit<RegisterInput, 'college'> {
    role: string;
    college?: string;
}

export type UpdateProfileInput = Partial<Pick<RegisterInput, 'username' | 'email'>>;

// Someone with user:update changing another person's details; college is a public id
export type UpdateUserInput = UpdateProfileInput & { college?: string };

export interface ListUsersQuery {
    page: number;
    limit: number;
    role?: string;
    // A college's public id
    college?: string;
    search?: string;
}
