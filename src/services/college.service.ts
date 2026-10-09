import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';
import { ApiError, paginationMeta } from '../common/utils/utils';
import { CollegeInput, ListCollegesQuery } from '../common/interfaces/college.interface';

// "Anna University" and "anna university" are the same college
async function ensureNameIsFree(name: string, exceptId?: string) {
    const existing = await collegeRepository.findByName(name);
    if (existing && existing.id !== exceptId) throw new ApiError(409, `A college named "${existing.name}" already exists`);
}

export async function listColleges({ page, limit, sort, ...filter }: ListCollegesQuery) {
    const { colleges, total } = await collegeRepository.findPageWithStats(filter, sort, page, limit);
    return { colleges, meta: paginationMeta(page, limit, total) };
}

export async function getCollegeById(id: string) {
    const college = await collegeRepository.findByIdWithStats(id);
    if (!college) throw new ApiError(404, 'College not found');
    return college;
}

export async function createCollege(actorId: string, input: CollegeInput) {
    await ensureNameIsFree(input.name);

    const college = await collegeRepository.create(input, actorId);
    return getCollegeById(college.id);
}

export async function updateCollege(id: string, input: Partial<CollegeInput>) {
    if (input.name) await ensureNameIsFree(input.name, id);

    const college = await collegeRepository.updateById(id, input);
    if (!college) throw new ApiError(404, 'College not found');
    return getCollegeById(id);
}

export async function deleteCollege(id: string) {
    const college = await collegeRepository.deleteById(id);
    if (!college) throw new ApiError(404, 'College not found');

    // Reviews of a college that no longer exists are meaningless, so they go with it
    await reviewRepository.deleteByCollege(id);
}
