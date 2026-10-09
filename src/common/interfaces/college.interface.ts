import type { Types } from 'mongoose';

export interface ICollege {
    name: string;
    city: string;
    state: string;
    description: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// A college together with the figures calculated from its reviews
export interface CollegeWithStats extends ICollege {
    _id: Types.ObjectId;
    // null when the college has no reviews yet (0 would look like a terrible score)
    averageRating: number | null;
    reviewCount: number;
}

export interface CollegeInput {
    name: string;
    city: string;
    state: string;
    description: string;
}

export const COLLEGE_SORTS = ['newest', 'name', 'rating', 'reviews'] as const;
export type CollegeSort = (typeof COLLEGE_SORTS)[number];

export interface CollegeFilter {
    search?: string;
    city?: string;
    state?: string;
    minRating?: number;
}

export interface ListCollegesQuery extends CollegeFilter {
    page: number;
    limit: number;
    sort: CollegeSort;
}
