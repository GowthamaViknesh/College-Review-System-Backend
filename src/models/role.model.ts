import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/public-id';
import { IRole } from '../common/interfaces/role.interface';
import { ALL_PERMISSIONS } from '../common/constants/permissions';

export type RoleDocument = HydratedDocument<IRole>;

const roleSchema = new Schema<IRole>(
    {
        // The id the API uses for this record. Created with it, and never changed afterwards.
        roleId: {
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
            required: [true, 'Role name is required'],
            unique: true,
            trim: true,
            lowercase: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        // Permission names granted by this role. Only names defined in code are accepted.
        permissions: [
            {
                type: String,
                enum: { values: ALL_PERMISSIONS, message: '"{VALUE}" is not a known permission' },
            },
        ],
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                const { _id, __v, ...role } = ret;
                return role;
            },
        },
    },
);

export const Role = model<IRole>('Role', roleSchema);
