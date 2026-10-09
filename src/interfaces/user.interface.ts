import type { Role } from '../constants/roles';

export interface IUser {
    username: string;
    email: string;
    password: string;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
}
