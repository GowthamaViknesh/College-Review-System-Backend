import bcrypt from 'bcryptjs';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

import { generatePublicId } from '../common/utils/public-id';
import { IUser, IUserMethods, StoredImage } from '../common/interfaces/user.interface';

type UserModel = Model<IUser, {}, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
    {
        // The id the API uses for this record. Created with it, and never changed afterwards.
        userId: {
            type: String,
            required: true,
            unique: true,
            // Records with no id yet are left out of the unique index instead of colliding on "missing"
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
            // Left out of every query unless it asks with .select('+password'), so the hash is not carried around the app
            select: false,
        },
        // A user has exactly one role; what the role may do lives on the Role document
        role: {
            type: Schema.Types.ObjectId,
            ref: 'Role',
            required: [true, 'Role is required'],
            index: true,
        },
        avatar: {
            type: new Schema<StoredImage>({ url: { type: String, required: true }, publicId: { type: String, required: true } }, { _id: false }),
            default: null,
        },
        // Access tokens issued before this moment are refused
        passwordChangedAt: { type: Date, default: null },
        // When they last logged in or made a request; null until they do
        lastActiveAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, password, __v, avatar, passwordChangedAt, ...user } = ret;
                // Clients get the picture's address only, never the id it is stored under
                return { ...user, avatar: avatar?.url ?? null };
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
