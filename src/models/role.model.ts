import { Schema, model, type HydratedDocument } from 'mongoose';

import { generatePublicId } from '../common/utils/utils';
import { IRole } from '../common/interfaces/role.interface';
import { ALL_PERMISSIONS } from '../common/constants/permissions';

export type RoleDocument = HydratedDocument<IRole>;

const roleSchema = new Schema<IRole>(
    {
        roleId: {
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
