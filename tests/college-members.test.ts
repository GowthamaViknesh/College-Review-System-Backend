import { Types } from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import { College } from '../src/models/college.model';
import { Review } from '../src/models/review.model';
import { Role } from '../src/models/role.model';
import { User } from '../src/models/user.model';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

// Pictures go to a stand-in, as in uploads.test.ts
jest.mock('../src/common/utils/image-storage', () => ({
    isImageStorageConfigured: jest.fn(() => true),
    uploadImage: jest.fn(async (_file: Buffer, kind: string, ownerId: string) => ({ url: `https://images.test/${kind}/${ownerId}.jpg`, publicId: `${kind}/${ownerId}` })),
    deleteImage: jest.fn(async () => undefined),
}));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const png = { filename: 'picture.png', contentType: 'image/png' };

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

// Two colleges, made directly so they add no users of their own
const makeCollege = (name: string) => College.create({ name, country: 'India', state: 'Tamil Nadu', city: 'Chennai', description: '', createdBy: new Types.ObjectId() });

// A teacher and two students at Anna, one teacher and one student at Loyola, and an admin with no college
async function campus() {
    const [anna, loyola] = [await makeCollege('Anna University'), await makeCollege('Loyola College')];
    const at = (college: { id: string }) => ({ college: college.id });
    return {
        anna,
        loyola,
        admin: await createUser('admin'),
        annaTeacher: await createUser('teacher', at(anna)),
        annaStudents: [await createUser('student', at(anna)), await createUser('student', at(anna))],
        loyolaTeacher: await createUser('teacher', at(loyola)),
        loyolaStudent: await createUser('student', at(loyola)),
    };
}

const newUser = { username: 'newcomer', email: 'newcomer@example.com', password: 'password123' };
const post = (auth: string, body: object) => request(app).post('/api/v1/users').set('Authorization', auth).send(body);
const list = (auth: string, query = '') => request(app).get(`/api/v1/users${query}`).set('Authorization', auth);
const usernames = (res: request.Response) => res.body.data.users.map((u: { username: string }) => u.username).sort();

describe('signing up', () => {
    it('needs the college you attend, and puts you in it', async () => {
        const { anna } = await campus();
        const missing = await request(app).post('/api/v1/auth/register').send(newUser);
        const joined = await request(app)
            .post('/api/v1/auth/register')
            .send({ ...newUser, college: anna.collegeId });

        expect(missing.status).toBe(400);
        expect(missing.body.errors[0].field).toBe('college');
        expect(joined.status).toBe(201);
        expect(joined.body.data.user.college).toEqual({ collegeId: anna.collegeId, name: 'Anna University' });
    });

    it('refuses a college that does not exist', async () => {
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send({ ...newUser, college: 'Unknown0Unknown0' });

        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toEqual({ field: 'college', message: 'That college does not exist' });
        expect(await User.countDocuments({ username: 'newcomer' })).toBe(0);
    });
});

describe('an administrator creating accounts', () => {
    it('chooses the college for teachers and students', async () => {
        const { admin, loyola } = await campus();
        const res = await post(admin.auth, { ...newUser, role: 'teacher', college: loyola.collegeId });

        expect(res.status).toBe(201);
        expect(res.body.data.user).toMatchObject({ role: { name: 'teacher' }, college: { collegeId: loyola.collegeId, name: 'Loyola College' } });
    });

    it('must choose one, except for another administrator', async () => {
        const { admin } = await campus();
        const student = await post(admin.auth, newUser);
        const teacher = await post(admin.auth, { ...newUser, role: 'teacher' });
        const anotherAdmin = await post(admin.auth, { ...newUser, role: 'admin' });

        for (const res of [student, teacher]) {
            expect(res.status).toBe(400);
            expect(res.body.errors[0]).toEqual({ field: 'college', message: 'Choose the college this person belongs to' });
        }
        expect(anotherAdmin.status).toBe(201);
        expect(anotherAdmin.body.data.user.college).toBeNull();
    });
});

describe('a teacher creating accounts', () => {
    it('creates students only, and they join the teacher’s own college', async () => {
        const { annaTeacher, anna } = await campus();
        const res = await post(annaTeacher.auth, newUser);

        expect(res.status).toBe(201);
        expect(res.body.data.user).toMatchObject({ role: { name: 'student' }, college: { collegeId: anna.collegeId } });

        for (const role of ['teacher', 'admin']) {
            const refused = await post(annaTeacher.auth, { username: 'sneaky', email: 'sneaky@example.com', password: 'password123', role });
            expect(refused.status).toBe(403);
            expect(refused.body.message).toBe('You may only create users with the "student" role');
        }
    });

    it('cannot place a student in another college', async () => {
        const { annaTeacher, loyola } = await campus();
        const res = await post(annaTeacher.auth, { ...newUser, college: loyola.collegeId });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('You may only create accounts in your own college');
        expect(await User.countDocuments({ username: 'newcomer' })).toBe(0);
    });

    it('cannot create anyone until they are assigned to a college themselves', async () => {
        await campus();
        const unassigned = await createUser('teacher');
        const res = await post(unassigned.auth, newUser);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('not assigned to a college');
    });

    it('can give a student of their college a picture, so the account is created complete', async () => {
        const { annaTeacher, annaStudents, loyolaStudent } = await campus();
        const own = await request(app).put(`/api/v1/users/${annaStudents[0].user.userId}/avatar`).set('Authorization', annaTeacher.auth).attach('image', PNG, png);
        const other = await request(app).put(`/api/v1/users/${loyolaStudent.user.userId}/avatar`).set('Authorization', annaTeacher.auth).attach('image', PNG, png);
        const colleague = await request(app).put(`/api/v1/users/${annaTeacher.user.userId}/avatar`).set('Authorization', annaTeacher.auth).attach('image', PNG, png);

        expect(own.status).toBe(200);
        expect(own.body.data.user.avatar).toContain(annaStudents[0].user.userId);
        // Out of their reach, so reported as not found
        expect(other.status).toBe(404);
        // Not through this route: their own picture is set from their profile
        expect(colleague.status).toBe(404);
    });

    it('still cannot edit a student’s username or email', async () => {
        const { annaTeacher, annaStudents } = await campus();
        const res = await request(app).patch(`/api/v1/users/${annaStudents[0].user.userId}`).set('Authorization', annaTeacher.auth).send({ email: 'changed@example.com' });
        expect(res.status).toBe(403);
    });
});

describe('who a teacher sees on the users page', () => {
    it('only the students of their own college', async () => {
        const { annaTeacher, annaStudents, loyolaTeacher, loyolaStudent } = await campus();
        // A second teacher at the same college is not a student, so is not listed either
        await createUser('teacher', { college: String(annaTeacher.user.college) });

        const anna = await list(annaTeacher.auth);
        const loyola = await list(loyolaTeacher.auth);

        expect(anna.status).toBe(200);
        expect(usernames(anna)).toEqual(annaStudents.map((s) => s.user.username).sort());
        expect(anna.body.meta.total).toBe(2);
        expect(usernames(loyola)).toEqual([loyolaStudent.user.username]);
        for (const user of anna.body.data.users) expect(user).toMatchObject({ role: { name: 'student' }, college: { name: 'Anna University' } });
    });

    it('whatever role or college the request asks for', async () => {
        const { annaTeacher, annaStudents, loyola } = await campus();
        const expected = annaStudents.map((s) => s.user.username).sort();

        expect(usernames(await list(annaTeacher.auth, '?role=admin'))).toEqual(expected);
        expect(usernames(await list(annaTeacher.auth, `?college=${loyola.collegeId}`))).toEqual(expected);
        expect(usernames(await list(annaTeacher.auth, '?limit=100&page=1'))).toEqual(expected);
    });

    it('can be searched, within those students', async () => {
        const { annaTeacher, annaStudents, loyolaStudent } = await campus();

        expect(usernames(await list(annaTeacher.auth, `?search=${annaStudents[0].user.username}`))).toEqual([annaStudents[0].user.username]);
        expect(usernames(await list(annaTeacher.auth, `?search=${loyolaStudent.user.email}`))).toEqual([]);
    });

    it('nobody, for a teacher not yet assigned to a college', async () => {
        await campus();
        const unassigned = await createUser('teacher');
        const res = await list(unassigned.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.users).toEqual([]);
        expect(res.body.meta.total).toBe(0);
    });

    it('one user at a time follows the same rule, and others are "not found"', async () => {
        const { annaTeacher, annaStudents, loyolaStudent, loyolaTeacher, admin } = await campus();
        const get = (userId: string) => request(app).get(`/api/v1/users/${userId}`).set('Authorization', annaTeacher.auth);

        expect((await get(annaStudents[0].user.userId)).status).toBe(200);
        for (const hidden of [loyolaStudent, loyolaTeacher, admin]) {
            const res = await get(hidden.user.userId);
            expect(res.status).toBe(404);
            expect(JSON.stringify(res.body)).not.toContain(hidden.user.email);
        }
    });

    it('a student sees no users at all', async () => {
        const { annaStudents } = await campus();
        expect((await list(annaStudents[0].auth)).status).toBe(403);
    });
});

describe('a teacher who has been given every user permission', () => {
    // The case that prompted the rule: the Teacher role is edited to include view, edit and delete
    async function empowered() {
        const people = await campus();
        await Role.updateOne({ name: 'teacher' }, { $addToSet: { permissions: { $each: ['user:read', 'user:update', 'user:delete'] } } });
        return people;
    }

    it('still sees only the students of their own college: no admin, no other teachers, no other college', async () => {
        const { annaTeacher, annaStudents, admin } = await empowered();
        const res = await list(annaTeacher.auth, '?limit=50');

        expect(usernames(res)).toEqual(annaStudents.map((s) => s.user.username).sort());
        expect(JSON.stringify(res.body)).not.toContain(admin.user.email);
        expect(JSON.stringify(res.body)).not.toContain(annaTeacher.user.email);
    });

    it('can edit and delete those students', async () => {
        const { annaTeacher, annaStudents } = await empowered();
        const [first, second] = annaStudents;

        const edited = await request(app).patch(`/api/v1/users/${first.user.userId}`).set('Authorization', annaTeacher.auth).send({ username: 'renamed' });
        const deleted = await request(app).delete(`/api/v1/users/${second.user.userId}`).set('Authorization', annaTeacher.auth);

        expect(edited.status).toBe(200);
        expect(deleted.status).toBe(204);
        expect(await User.findById(second.user.id)).toBeNull();
    });

    it('cannot delete, edit or even fetch an administrator', async () => {
        const { annaTeacher, admin } = await empowered();
        const as = (method: 'get' | 'patch' | 'delete') => request(app)[method](`/api/v1/users/${admin.user.userId}`).set('Authorization', annaTeacher.auth);

        expect((await as('delete')).status).toBe(404);
        expect((await as('patch').send({ email: 'taken-over@example.com' })).status).toBe(404);
        expect((await as('get')).status).toBe(404);
        const still = await User.findById(admin.user.id);
        expect(still).not.toBeNull();
        expect(still!.email).toBe(admin.user.email);
    });

    it('cannot delete a teacher, or a student of another college', async () => {
        const { annaTeacher, loyolaTeacher, loyolaStudent } = await empowered();
        const colleague = await createUser('teacher', { college: String(annaTeacher.user.college) });

        for (const target of [colleague, loyolaTeacher, loyolaStudent]) {
            const res = await request(app).delete(`/api/v1/users/${target.user.userId}`).set('Authorization', annaTeacher.auth);
            expect(res.status).toBe(404);
            expect(await User.findById(target.user.id)).not.toBeNull();
        }
    });

    it('cannot change anyone\u2019s role, which would be the way out of these limits', async () => {
        const { annaTeacher, annaStudents } = await empowered();
        const res = await request(app).patch(`/api/v1/users/${annaStudents[0].user.userId}/role`).set('Authorization', annaTeacher.auth).send({ role: 'admin' });
        expect(res.status).toBe(403);
    });
});

describe('who an administrator sees', () => {
    it('everyone, with their college, and can narrow the list to one college', async () => {
        const { admin, anna, loyola } = await campus();
        const everyone = await list(admin.auth, '?limit=50');
        const onlyLoyola = await list(admin.auth, `?college=${loyola.collegeId}`);
        const annaTeachers = await list(admin.auth, `?college=${anna.collegeId}&role=teacher`);

        expect(everyone.body.meta.total).toBe(6);
        expect(everyone.body.data.users.find((u: { role: { name: string } }) => u.role.name === 'admin').college).toBeNull();
        expect(onlyLoyola.body.meta.total).toBe(2);
        expect(annaTeachers.body.meta.total).toBe(1);
        expect((await list(admin.auth, '?college=Unknown0Unknown0')).body.meta.total).toBe(0);
    });
});

describe('moving someone to another college', () => {
    const move = (auth: string, userId: string, college: string) => request(app).patch(`/api/v1/users/${userId}`).set('Authorization', auth).send({ college });

    it('is done by an administrator, and changes which teacher sees the student', async () => {
        const { admin, annaTeacher, loyolaTeacher, annaStudents, loyola } = await campus();
        const moved = annaStudents[0];

        const res = await move(admin.auth, moved.user.userId, loyola.collegeId);

        expect(res.status).toBe(200);
        expect(res.body.data.user.college).toEqual({ collegeId: loyola.collegeId, name: 'Loyola College' });
        expect(usernames(await list(annaTeacher.auth))).not.toContain(moved.user.username);
        expect(usernames(await list(loyolaTeacher.auth))).toContain(moved.user.username);
    });

    it('needs role:assign: being able to edit users is not enough', async () => {
        const { anna, annaStudents, loyola } = await campus();
        await Role.create({ name: 'registrar', description: 'Keeps student records', permissions: ['user:read', 'user:update'] });
        const registrar = await createUser('registrar', { college: anna.id });

        const res = await move(registrar.auth, annaStudents[0].user.userId, loyola.collegeId);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe('Moving a user to another college needs the role:assign permission');
        // The rest of an edit still works for them
        expect((await request(app).patch(`/api/v1/users/${annaStudents[0].user.userId}`).set('Authorization', registrar.auth).send({ username: 'renamed' })).status).toBe(200);
    });

    it('refuses a college that does not exist', async () => {
        const { admin, annaStudents } = await campus();
        const res = await move(admin.auth, annaStudents[0].user.userId, 'Unknown0Unknown0');
        expect(res.status).toBe(400);
        expect(res.body.errors[0].field).toBe('college');
    });
});

describe('a college with people in it', () => {
    it('cannot be deleted until they are moved', async () => {
        const { admin, anna, loyola, loyolaTeacher, loyolaStudent } = await campus();
        const remove = () => request(app).delete(`/api/v1/colleges/${loyola.collegeId}`).set('Authorization', admin.auth);

        const refused = await remove();
        expect(refused.status).toBe(409);
        expect(refused.body.message).toBe('2 user(s) belong to this college; move them to another college first');
        expect(await College.countDocuments({ name: 'Loyola College' })).toBe(1);

        for (const person of [loyolaTeacher, loyolaStudent])
            await request(app).patch(`/api/v1/users/${person.user.userId}`).set('Authorization', admin.auth).send({ college: anna.collegeId });
        expect((await remove()).status).toBe(204);
    });
});

describe('what stays open to everyone', () => {
    it('your own account shows your college', async () => {
        const { annaTeacher, anna, admin } = await campus();
        const me = await request(app).get('/api/v1/auth/me').set('Authorization', annaTeacher.auth);
        const adminMe = await request(app).get('/api/v1/auth/me').set('Authorization', admin.auth);

        expect(me.body.data.user.college).toEqual({ collegeId: anna.collegeId, name: 'Anna University' });
        expect(adminMe.body.data.user.college).toBeNull();
    });

    it('a teacher still reads the reviews of every college, with the author’s name but none of their details', async () => {
        const { annaTeacher, loyola, loyolaStudent } = await campus();
        await Review.create({ college: loyola.id, user: loyolaStudent.user.id, rating: 4, comment: 'A good place to study overall' });

        const res = await request(app).get(`/api/v1/reviews?college=${loyola.collegeId}`).set('Authorization', annaTeacher.auth);

        expect(res.status).toBe(200);
        expect(res.body.data.reviews[0].user).toEqual({ userId: loyolaStudent.user.userId, username: loyolaStudent.user.username, avatar: null });
        expect(JSON.stringify(res.body)).not.toContain(loyolaStudent.user.email);
        expect((await request(app).get('/api/v1/colleges').set('Authorization', annaTeacher.auth)).body.meta.total).toBe(2);
    });
});
