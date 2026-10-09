import { Schema, model, type HydratedDocument } from 'mongoose';

import { ICollege } from '../common/interfaces/college.interface';
import { StoredImage } from '../common/interfaces/user.interface';

export type CollegeDocument = HydratedDocument<ICollege>;

// Ratings are deliberately not stored here. They are calculated from the reviews collection
// whenever a college is read, so they can never be out of date.
const collegeSchema = new Schema<ICollege>(
    {
        name: {
            type: String,
            required: [true, 'College name is required'],
            unique: true,
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
                const { __v, image, ...college } = ret;
                return { ...college, image: image?.url ?? null };
            },
        },
    },
);

// Supports filtering the list by location
collegeSchema.index({ state: 1, city: 1 });

export const College = model<ICollege>('College', collegeSchema);
