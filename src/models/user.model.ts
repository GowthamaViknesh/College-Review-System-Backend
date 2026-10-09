import bcrypt from 'bcryptjs';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

import { IUser, IUserMethods } from '../common/interfaces/user.interface';

type UserModel = Model<IUser, {}, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
        },
        // A user has exactly one role; what the role may do lives on the Role document
        role: {
            type: Schema.Types.ObjectId,
            ref: 'Role',
            required: [true, 'Role is required'],
            index: true,
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
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.method('comparePassword', function (candidate: string) {
    return bcrypt.compare(candidate, this.password);
});

export const User = model<IUser, UserModel>('User', userSchema);
