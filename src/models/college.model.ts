import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { ICollege } from '../common/interfaces/college.interface';
import { StoredImage } from '../common/interfaces/user.interface';

export type CollegeDocument = HydratedDocument<ICollege>;

const collegeSchema = new Schema<ICollege>(
    {
        collegeId: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            immutable: true,
            trim: true,
            default: () => generatePublicId(),
        },
        name: {
            type: String,
            required: [true, 'College name is required'],
            unique: true,
            trim: true,
        },
        country: {
            type: String,
            required: [true, 'Country is required'],
            trim: true,
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true,
        },
        state: {
            type: String,
            required: [true, 'State is required'],
            trim: true,
        },
        address: {
            type: String,
            default: '',
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        image: {
            type: new Schema<StoredImage>({ url: { type: String, required: true }, publicId: { type: String, required: true } }, { _id: false }),
            default: null,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'createdBy is required'],
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, __v, image, ...college } = ret;
                return { ...college, ...(image !== undefined && { image: image?.url ?? null }) };
            },
        },
    },
);

collegeSchema.index({ country: 1, state: 1, city: 1 });

export const College = model<ICollege>('College', collegeSchema);
