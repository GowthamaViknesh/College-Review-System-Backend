import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/public-id';
import { ICollege } from '../common/interfaces/college.interface';
import { StoredImage } from '../common/interfaces/user.interface';

export type CollegeDocument = HydratedDocument<ICollege>;

// Ratings are deliberately not stored here. They are calculated from the reviews collection
// whenever a college is read, so they can never be out of date.
const collegeSchema = new Schema<ICollege>(
    {
        // The id the API uses for this record. Created with it, and never changed afterwards.
        collegeId: {
            type: String,
            required: true,
            unique: true,
            // Records with no id yet are left out of the unique index instead of colliding on "missing"
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
        // Street, area, postcode: whatever is needed to find the campus within its city
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
                // Left out altogether when the picture was not loaded, as when a college is only named inside another record
                return { ...college, ...(image !== undefined && { image: image?.url ?? null }) };
            },
        },
    },
);

// Supports filtering the list by location
collegeSchema.index({ country: 1, state: 1, city: 1 });

export const College = model<ICollege>('College', collegeSchema);
