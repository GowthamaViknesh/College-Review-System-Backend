import os from 'node:os';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createStarterRoles, syncRoles } from '../../src/services/role.service';

let mongo: MongoMemoryServer;

// The same state a real database is in after startup followed by "npm run seed"
async function seedRoles() {
    await syncRoles();
    await createStarterRoles();
}

export async function connectTestDb() {
    mongo = await MongoMemoryServer.create();
    // The MongoDB driver loads `os` via dynamic import(), which Jest's VM blocks;
    // passing it in directly keeps the connection handshake working under Jest.
    await mongoose.connect(mongo.getUri(), { runtimeAdapters: { os } });
    await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
    await seedRoles();
}

// Wipes everything, then restores the roles so each test starts the same way
export async function clearTestDb() {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    await seedRoles();
}

export async function closeTestDb() {
    await mongoose.disconnect();
    await mongo?.stop();
}
