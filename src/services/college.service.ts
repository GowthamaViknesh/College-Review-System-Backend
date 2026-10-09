import * as reviewRepository from '../repositories/review.repository';
import * as collegeRepository from '../repositories/college.repository';
import * as userRepository from '../repositories/user.repository';
import { ApiError, paginationMeta } from '../common/utils/utils';
import { deleteImage, uploadImage } from '../common/utils/image-storage';
import { CollegeInput, ListCollegesQuery } from '../common/interfaces/college.interface';

// "Anna University" and "anna university" are the same college
async function ensureNameIsFree(name: string, exceptId?: string) {
    const existing = await collegeRepository.findByName(name);
    if (existing && existing.collegeId !== exceptId) throw new ApiError(409, `A college named "${existing.name}" already exists`);
}

export async function listColleges({ page, limit, sort, order, ...filter }: ListCollegesQuery) {
    const { colleges, total } = await collegeRepository.findPageWithStats(filter, { sort, order }, page, limit);
    return { colleges, meta: paginationMeta(page, limit, total) };
}

// In this file an id parameter is a college's public id (collegeId)

export async function getCollegeById(id: string) {
    const college = await collegeRepository.findByCollegeIdWithStats(id);
    if (!college) throw new ApiError(404, 'College not found');
    return college;
}

export async function createCollege(actorId: string, input: CollegeInput) {
    await ensureNameIsFree(input.name);

    const college = await collegeRepository.create(input, actorId);
    return getCollegeById(college.collegeId);
}

export async function updateCollege(id: string, input: Partial<CollegeInput>) {
    if (input.name) await ensureNameIsFree(input.name, id);

    const college = await collegeRepository.updateByCollegeId(id, input);
    if (!college) throw new ApiError(404, 'College not found');
    return getCollegeById(id);
}

export async function setCollegeImage(id: string, file: Buffer) {
    // Checked first so a picture is never uploaded for a college that does not exist
    if (!(await collegeRepository.findByCollegeId(id))) throw new ApiError(404, 'College not found');

    const image = await uploadImage(file, 'college', id);

    const before = await collegeRepository.setImageByCollegeId(id, image);
    if (!before) {
        // The college was deleted while the picture was uploading
        await deleteImage(image.publicId);
        throw new ApiError(404, 'College not found');
    }
    // A new upload normally overwrites the previous picture in storage. One stored under a different
    // name (from before public ids existed) would be left behind, so it is removed here.
    if (before.image && before.image.publicId !== image.publicId) await deleteImage(before.image.publicId);
    return getCollegeById(id);
}

// Fine to call when there is no picture: the result is the same either way
export async function removeCollegeImage(id: string) {
    const before = await collegeRepository.setImageByCollegeId(id, null);
    if (!before) throw new ApiError(404, 'College not found');

    if (before.image) await deleteImage(before.image.publicId);
    return getCollegeById(id);
}

export async function deleteCollege(id: string) {
    const existing = await collegeRepository.findByCollegeId(id);
    if (!existing) throw new ApiError(404, 'College not found');

    // Every teacher and student belongs to a college, so one that still has people cannot simply vanish
    const members = await userRepository.countByCollege(existing.id);
    if (members > 0) throw new ApiError(409, `${members} user(s) belong to this college; move them to another college first`);

    const college = await collegeRepository.deleteByCollegeId(id);
    if (!college) throw new ApiError(404, 'College not found');

    // Reviews of a college that no longer exists are meaningless, so they go with it.
    // They are linked to it by MongoDB's id, not the public one.
    await reviewRepository.deleteByCollege(college.id);
    if (college.image) await deleteImage(college.image.publicId);
}
