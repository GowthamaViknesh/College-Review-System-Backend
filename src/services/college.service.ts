import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';
import { ApiError, paginationMeta } from '../common/utils/utils';
import { deleteImage, uploadImage } from '../common/utils/image-storage';
import { CollegeInput, ListCollegesQuery } from '../common/interfaces/college.interface';

// "Anna University" and "anna university" are the same college
async function ensureNameIsFree(name: string, exceptId?: string) {
    const existing = await collegeRepository.findByName(name);
    if (existing && existing.id !== exceptId) throw new ApiError(409, `A college named "${existing.name}" already exists`);
}

export async function listColleges({ page, limit, sort, order, ...filter }: ListCollegesQuery) {
    const { colleges, total } = await collegeRepository.findPageWithStats(filter, { sort, order }, page, limit);
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

export async function setCollegeImage(id: string, file: Buffer) {
    // Checked first so a picture is never uploaded for a college that does not exist
    if (!(await collegeRepository.existsById(id))) throw new ApiError(404, 'College not found');

    // A new upload takes the place of the previous picture in storage, so there is nothing to remove first
    const image = await uploadImage(file, 'college', id);

    if (!(await collegeRepository.setImageById(id, image))) {
        // The college was deleted while the picture was uploading
        await deleteImage(image.publicId);
        throw new ApiError(404, 'College not found');
    }
    return getCollegeById(id);
}

// Fine to call when there is no picture: the result is the same either way
export async function removeCollegeImage(id: string) {
    const before = await collegeRepository.setImageById(id, null);
    if (!before) throw new ApiError(404, 'College not found');

    if (before.image) await deleteImage(before.image.publicId);
    return getCollegeById(id);
}

export async function deleteCollege(id: string) {
    const college = await collegeRepository.deleteById(id);
    if (!college) throw new ApiError(404, 'College not found');

    // Reviews of a college that no longer exists are meaningless, so they go with it
    await reviewRepository.deleteByCollege(id);
    if (college.image) await deleteImage(college.image.publicId);
}
