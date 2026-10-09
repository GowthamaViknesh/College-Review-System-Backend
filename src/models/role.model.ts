import { Schema, model, type HydratedDocument } from 'mongoose';

import { IRole } from '../common/interfaces/role.interface';
import { ALL_PERMISSIONS } from '../common/constants/permissions';

export type RoleDocument = HydratedDocument<IRole>;

const roleSchema = new Schema<IRole>(
    {
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
                const { __v, ...role } = ret;
                return role;
            },
        },
    },
);

export const Role = model<IRole>('Role', roleSchema);
