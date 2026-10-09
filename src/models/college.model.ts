import { Schema, model, type HydratedDocument } from 'mongoose';

import { ICollege } from '../common/interfaces/college.interface';

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
                const { __v, ...college } = ret;
                return college;
            },
        },
    },
);

// Supports filtering the list by location
collegeSchema.index({ state: 1, city: 1 });

export const College = model<ICollege>('College', collegeSchema);
