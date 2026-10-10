import type { Types } from 'mongoose';
export interface StoredImage {
    url: string;
    publicId: string;
}

export interface IUser {
    userId: string;
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
    college: Types.ObjectId | null;
    avatar: StoredImage | null;
    passwordChangedAt: Date | null;
    lastActiveAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserMethods {
    comparePassword(candidate: string): Promise<boolean>;
}

export interface UserFilter {
    role?: Types.ObjectId;
    college?: string;
    search?: string;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
    role: Types.ObjectId;
    college: string | null;
}

export interface RegisterInput {
    username: string;
    email: string;
    password: string;
    college: string;
}
export interface CreateUserRequest extends Omit<RegisterInput, 'college'> {
    role: string;
    college?: string;
}

export type UpdateProfileInput = Partial<Pick<RegisterInput, 'username' | 'email'>>;

export type UpdateUserInput = UpdateProfileInput & { college?: string };

export interface ListUsersQuery {
    page: number;
    limit: number;
    role?: string;
    college?: string;
    search?: string;
}

export interface IPasswordReset {
    passwordResetId: string;
    user: Types.ObjectId;
    codeHash: string;
    attempts: number;
    resetTokenHash: string | null;
    sentAt: Date;
    expiresAt: Date;
}
