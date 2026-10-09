import type { Types } from 'mongoose';

import type { StoredImage } from './user.interface';

export interface ICollege {
    // The id the API uses for this college. MongoDB's _id never leaves the server.
    collegeId: string;
    name: string;
    // Where the college is. Country, state and city are names as people read them ("India", "Tamil Nadu",
    // "Chennai"), chosen from lists in the frontend; the address is the street-level part, typed freely.
    country: string;
    state: string;
    city: string;
    address: string;
    description: string;
    // Picture of the college; null until someone uploads one
    image: StoredImage | null;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

// A college together with the figures calculated from its reviews
// A college as the API returns it: no _id, and the creator shown by their public id
export interface CollegeWithStats extends Omit<ICollege, 'image' | 'createdBy'> {
    // userId of whoever added the college; null if that account has since been deleted
    createdBy: string | null;
    // Just the address: the storage id is of no use to a client
    image: string | null;
    // null when the college has no reviews yet (0 would look like a terrible score)
    averageRating: number | null;
    reviewCount: number;
}

export interface CollegeInput {
    name: string;
    country: string;
    state: string;
    city: string;
    address: string;
    description: string;
}

export const COLLEGE_SORTS = ['newest', 'name', 'rating', 'reviews'] as const;
export type CollegeSort = (typeof COLLEGE_SORTS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface CollegeFilter {
    search?: string;
    country?: string;
    city?: string;
    state?: string;
    minRating?: number;
}

export interface ListCollegesQuery extends CollegeFilter {
    page: number;
    limit: number;
    sort: CollegeSort;
    // Leave out for each sort's natural direction: name A-Z, everything else highest or newest first
    order?: SortOrder;
}
