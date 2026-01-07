import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export async function setupTestDatabase(): Promise<string> {
  mongod = await MongoMemoryServer.create();
  return mongod.getUri();
}

export async function teardownTestDatabase(): Promise<void> {
  if (mongod) {
    await mongod.stop();
  }
}
