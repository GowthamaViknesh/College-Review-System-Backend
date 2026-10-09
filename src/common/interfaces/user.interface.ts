import type { Types } from 'mongoose';

// A picture kept in image storage: the address to show it, and the id needed to delete it later
export interface StoredImage {
    url: string;
    publicId: string;
}

export interface IUser {
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
    // Profile picture; null until the user uploads one
    avatar: StoredImage | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserMethods {
    comparePassword(candidate: string): Promise<boolean>;
}

export interface UserFilter {
    role?: Types.ObjectId;
    search?: string;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
}

// Signing up yourself: no role, everyone starts with the default role
export interface RegisterInput {
    username: string;
    email: string;
    password: string;
}

// An existing user creating an account for someone else; the role is referred to by name, e.g. "teacher"
export interface CreateUserRequest extends RegisterInput {
    role: string;
}

export type UpdateProfileInput = Partial<Pick<RegisterInput, 'username' | 'email'>>;

export interface ListUsersQuery {
    page: number;
    limit: number;
    role?: string;
    search?: string;
}
