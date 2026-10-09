import request from 'supertest';
import app from '../src/app';
import { ALL_PERMISSIONS } from '../src/common/constants/permissions';
import { Role } from '../src/models/role.model';
import { createStarterRoles, syncRoles } from '../src/services/role.service';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const UNKNOWN_ID = 'Unknown0Unknown0';
const roleId = async (name: string) => (await Role.findOne({ name }))!.roleId;

describe('access to roles and permissions', () => {
    it.each(['/api/v1/roles', '/api/v1/permissions'])('%s is not public', async (path) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
    });

    it.each(['student', 'teacher'])('a %s cannot read or change roles', async (role) => {
        const { auth } = await createUser(role);
        const id = await roleId('student');

        expect((await request(app).get('/api/v1/roles').set('Authorization', auth)).status).toBe(403);
        expect((await request(app).get('/api/v1/permissions').set('Authorization', auth)).status).toBe(403);
        expect((await request(app).post('/api/v1/roles').set('Authorization', auth).send({ name: 'hacker' })).status).toBe(403);
        expect(
            (
                await request(app)
                    .patch(`/api/v1/roles/${id}`)
                    .set('Authorization', auth)
                    .send({ permissions: ['user:delete'] })
            ).status,
        ).toBe(403);
        expect((await request(app).delete(`/api/v1/roles/${id}`).set('Authorization', auth)).status).toBe(403);
    });
});

describe('GET /api/v1/permissions', () => {
    it('lists every permission defined in code', async () => {
        const admin = await createUser('admin');
        const res = await request(app).get('/api/v1/permissions').set('Authorization', admin.auth);

        expect(res.status).toBe(200);
        const names = res.body.data.permissions.map((p: { name: string }) => p.name);
        expect(names).toEqual([...ALL_PERMISSIONS].sort());
        expect(res.body.data.permissions[0]).toEqual({
            name: expect.any(String),
            resource: expect.any(String),
            description: expect.any(String),
        });
    });
});

describe('GET /api/v1/roles', () => {
    it('lists the roles with their permission names and nothing else', async () => {
        const admin = await createUser('admin');
        const res = await request(app).get('/api/v1/roles').set('Authorization', admin.auth);

        expect(res.status).toBe(200);
        const byName = Object.fromEntries(res.body.data.roles.map((r: { name: string }) => [r.name, r]));
        expect(Object.keys(byName)).toEqual(['admin', 'student', 'teacher']);
        expect(byName.admin.permissions).toEqual([...ALL_PERMISSIONS].sort());
        expect(byName.teacher.permissions).toEqual(['college:create', 'college:update', 'user:create']);
        expect(byName.student.permissions).toEqual(['review:create']);
        expect(Object.keys(byName.student).sort()).toEqual(['createdAt', 'description', 'name', 'permissions', 'roleId', 'updatedAt']);
    });

    it('returns one role by id, 404 for an unknown id and 400 for a malformed id', async () => {
        const admin = await createUser('admin');

        const found = await request(app)
            .get(`/api/v1/roles/${await roleId('teacher')}`)
            .set('Authorization', admin.auth);
        expect(found.status).toBe(200);
        expect(found.body.data.role.name).toBe('teacher');

        expect((await request(app).get(`/api/v1/roles/${UNKNOWN_ID}`).set('Authorization', admin.auth)).status).toBe(404);
        expect((await request(app).get('/api/v1/roles/nope').set('Authorization', admin.auth)).status).toBe(400);
    });
});

describe('POST /api/v1/roles', () => {
    it('creates a role', async () => {
        const admin = await createUser('admin');
        const res = await request(app)
            .post('/api/v1/roles')
            .set('Authorization', admin.auth)
            .send({ name: 'Moderator', description: 'Removes abusive reviews', permissions: ['review:delete:any'] });

        expect(res.status).toBe(201);
        expect(res.body.data.role).toMatchObject({
            name: 'moderator',
            description: 'Removes abusive reviews',
            permissions: ['review:delete:any'],
        });
    });

    it('gives a user with the new role exactly its permissions', async () => {
        const admin = await createUser('admin');
        await request(app)
            .post('/api/v1/roles')
            .set('Authorization', admin.auth)
            .send({ name: 'auditor', permissions: ['user:read'] });
        const auditor = await createUser('auditor');

        expect((await request(app).get('/api/v1/users').set('Authorization', auditor.auth)).status).toBe(200);
        expect((await request(app).delete(`/api/v1/users/${admin.user.userId}`).set('Authorization', auditor.auth)).status).toBe(403);
        expect((await request(app).get('/api/v1/roles').set('Authorization', auditor.auth)).status).toBe(403);
    });

    it('rejects a duplicate name with 409', async () => {
        const admin = await createUser('admin');
        const res = await request(app).post('/api/v1/roles').set('Authorization', admin.auth).send({ name: 'teacher' });
        expect(res.status).toBe(409);
    });

    it('rejects unknown permissions and invalid names with 400', async () => {
        const admin = await createUser('admin');

        const unknown = await request(app)
            .post('/api/v1/roles')
            .set('Authorization', admin.auth)
            .send({ name: 'moderator', permissions: ['review:create', 'banana:eat'] });
        expect(unknown.status).toBe(400);
        expect(unknown.body.errors[0]).toEqual({ field: 'permissions', message: 'Unknown permission(s): banana:eat' });

        const badName = await request(app).post('/api/v1/roles').set('Authorization', admin.auth).send({ name: 'Bad Name!' });
        expect(badName.status).toBe(400);
        expect(badName.body.errors[0].field).toBe('name');
    });
});

describe('PATCH /api/v1/roles/:id', () => {
    it('changes what a role may do, effective on the very next request', async () => {
        const admin = await createUser('admin');
        const student = await createUser('student');
        expect((await request(app).get('/api/v1/users').set('Authorization', student.auth)).status).toBe(403);

        const res = await request(app)
            .patch(`/api/v1/roles/${await roleId('student')}`)
            .set('Authorization', admin.auth)
            .send({ permissions: ['review:create', 'user:read'] });

        expect(res.status).toBe(200);
        expect(res.body.data.role.permissions).toEqual(['review:create', 'user:read']);
        expect((await request(app).get('/api/v1/users').set('Authorization', student.auth)).status).toBe(200);
    });

    it('renames a role, and its users keep it', async () => {
        const admin = await createUser('admin');
        const teacher = await createUser('teacher');

        const res = await request(app)
            .patch(`/api/v1/roles/${await roleId('teacher')}`)
            .set('Authorization', admin.auth)
            .send({ name: 'professor', description: 'Teaching staff' });

        expect(res.status).toBe(200);
        expect(res.body.data.role).toMatchObject({ name: 'professor', description: 'Teaching staff' });

        const me = await request(app).get('/api/v1/auth/me').set('Authorization', teacher.auth);
        expect(me.body.data.user.role.name).toBe('professor');
    });

    it('refuses any change to the admin role, so admins cannot be locked out', async () => {
        const admin = await createUser('admin');
        const id = await roleId('admin');

        for (const body of [{ permissions: [] }, { name: 'superuser' }, { description: 'changed' }]) {
            const res = await request(app).patch(`/api/v1/roles/${id}`).set('Authorization', admin.auth).send(body);
            expect(res.status).toBe(403);
        }

        const role = await Role.findOne({ name: 'admin' });
        expect(role!.permissions).toHaveLength(ALL_PERMISSIONS.length);
    });

    it('rejects a rename to a name already in use, an empty body and an unknown id', async () => {
        const admin = await createUser('admin');
        const created = await request(app).post('/api/v1/roles').set('Authorization', admin.auth).send({ name: 'moderator' });
        const id = created.body.data.role.roleId;

        expect((await request(app).patch(`/api/v1/roles/${id}`).set('Authorization', admin.auth).send({ name: 'student' })).status).toBe(409);
        expect((await request(app).patch(`/api/v1/roles/${id}`).set('Authorization', admin.auth).send({})).status).toBe(400);
        expect((await request(app).patch(`/api/v1/roles/${UNKNOWN_ID}`).set('Authorization', admin.auth).send({ description: 'x' })).status).toBe(404);
    });
});

describe('DELETE /api/v1/roles/:id', () => {
    it('deletes a role nobody has, including a starter role', async () => {
        const admin = await createUser('admin');

        const res = await request(app)
            .delete(`/api/v1/roles/${await roleId('teacher')}`)
            .set('Authorization', admin.auth);

        expect(res.status).toBe(204);
        expect(await Role.findOne({ name: 'teacher' })).toBeNull();
    });

    it('refuses to delete the admin role', async () => {
        const admin = await createUser('admin');
        const res = await request(app)
            .delete(`/api/v1/roles/${await roleId('admin')}`)
            .set('Authorization', admin.auth);
        expect(res.status).toBe(403);
    });

    it('refuses to delete a role that users still have', async () => {
        const admin = await createUser('admin');
        await createUser('teacher');

        const res = await request(app)
            .delete(`/api/v1/roles/${await roleId('teacher')}`)
            .set('Authorization', admin.auth);

        expect(res.status).toBe(409);
        expect(await Role.findOne({ name: 'teacher' })).not.toBeNull();
    });

    it('returns 404 for an unknown id', async () => {
        const admin = await createUser('admin');
        const res = await request(app).delete(`/api/v1/roles/${UNKNOWN_ID}`).set('Authorization', admin.auth);
        expect(res.status).toBe(404);
    });
});

describe('startup sync and seeding', () => {
    it('are safe to run repeatedly', async () => {
        await syncRoles();
        await createStarterRoles();
        await syncRoles();
        await createStarterRoles();
        expect(await Role.countDocuments()).toBe(3);
    });

    it('startup only guarantees the admin role; other roles are left to the admin', async () => {
        await Role.deleteMany({});

        await syncRoles();

        const roles = await Role.find();
        expect(roles.map((r) => r.name)).toEqual(['admin']);
        expect(roles[0].permissions).toHaveLength(ALL_PERMISSIONS.length);
    });

    it('startup gives the admin role back any permission it is missing', async () => {
        await Role.updateOne({ name: 'admin' }, { permissions: ['review:create'] });

        await syncRoles();

        expect((await Role.findOne({ name: 'admin' }))!.permissions).toHaveLength(ALL_PERMISSIONS.length);
    });

    it('neither startup nor seeding undoes changes an admin made to other roles', async () => {
        await Role.updateOne({ name: 'student' }, { permissions: [] });
        await Role.deleteOne({ name: 'teacher' });

        await syncRoles();

        expect((await Role.findOne({ name: 'student' }))!.permissions).toHaveLength(0);
        expect(await Role.findOne({ name: 'teacher' })).toBeNull();

        await createStarterRoles(); // seeding again only adds what is missing
        expect((await Role.findOne({ name: 'student' }))!.permissions).toHaveLength(0);
        expect(await Role.findOne({ name: 'teacher' })).not.toBeNull();
    });

    it('startup removes permissions that no longer exist in code from every role', async () => {
        // Written straight to the collection, as if left over from an older version of the code
        await Role.collection.updateOne({ name: 'student' }, { $push: { permissions: 'legacy:thing' } as never });

        await syncRoles();

        expect((await Role.findOne({ name: 'student' }))!.permissions).toEqual(['review:create']);
    });

    it('the model rejects an unknown permission too', async () => {
        await expect(Role.create({ name: 'broken', permissions: ['banana:eat'] })).rejects.toThrow(/not a known permission/);
    });
});
