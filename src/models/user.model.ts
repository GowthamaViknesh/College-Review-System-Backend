import { Schema, model, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ROLES, ROLES, type Role } from '../constants/roles';
import { IUser } from '../interfaces/user.interface';

const SALT_ROUNDS = 10;

interface IUserMethods {
    comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
            minlength: [3, 'Username must be at least 3 characters'],
            maxlength: [30, 'Username must be at most 30 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false, // never returned by queries unless explicitly requested with .select('+password')
        },
        role: {
            type: String,
            enum: { values: ALL_ROLES, message: 'Role must be one of: ' + ALL_ROLES.join(', ') },
            default: ROLES.STUDENT,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { password, __v, ...user } = ret;
                return user;
            },
        },
    },
);

// Hash only when the password is new or changed, so profile updates don't re-hash the hash
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.method('comparePassword', function (candidate: string) {
    return bcrypt.compare(candidate, this.password);
});

export const User = model<IUser, UserModel>('User', userSchema);
