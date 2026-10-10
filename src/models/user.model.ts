import bcrypt from 'bcryptjs';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { IUser, IUserMethods, StoredImage } from '../common/interfaces/user.interface';

type UserModel = Model<IUser, {}, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            immutable: true,
            trim: true,
            default: () => generatePublicId(),
        },
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
            select: false,
        },
        role: {
            type: Schema.Types.ObjectId,
            ref: 'Role',
            required: [true, 'Role is required'],
            index: true,
        },
        college: {
            type: Schema.Types.ObjectId,
            ref: 'College',
            default: null,
            index: true,
        },
        avatar: {
            type: new Schema<StoredImage>({ url: { type: String, required: true }, publicId: { type: String, required: true } }, { _id: false }),
            default: null,
        },
        passwordChangedAt: { type: Date, default: null },
        lastActiveAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, password, __v, avatar, passwordChangedAt, ...user } = ret;
                return { ...user, avatar: avatar?.url ?? null };
            },
        },
    },
);

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.method('comparePassword', function (candidate: string) {
    return bcrypt.compare(candidate, this.password);
});

export const User = model<IUser, UserModel>('User', userSchema);
