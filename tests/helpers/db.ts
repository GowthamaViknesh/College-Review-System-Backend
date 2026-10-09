import os from 'node:os';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;

export async function connectTestDb() {
  mongo = await MongoMemoryServer.create();
  // The MongoDB driver loads `os` via dynamic import(), which Jest's VM blocks;
  // passing it in directly keeps the connection handshake working under Jest.
  await mongoose.connect(mongo.getUri(), { runtimeAdapters: { os } });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
}

export async function clearTestDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export async function closeTestDb() {
  await mongoose.disconnect();
  await mongo?.stop();
}
