import { MongoClient } from 'mongodb';

const clientOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 30_000,
  connectTimeoutMS: 10_000,
};

// Lazy connect: env vars are read on first use, not at module load.
// Module-load reads break `next build` page-data collection when env
// vars are absent in the build environment (e.g. Vercel).
function getClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  const uri = process.env.MONGODB_URI;
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(
        uri,
        clientOptions,
      ).connect();
    }
    return global._mongoClientPromise;
  }
  if (!globalThis._mongoClientPromise) {
    globalThis._mongoClientPromise = new MongoClient(
      uri,
      clientOptions,
    ).connect();
  }
  return globalThis._mongoClientPromise;
}

export async function getClient() {
  return getClientPromise();
}

export async function getDb() {
  const client = await getClientPromise();
  return client.db(process.env.MONGODB_DB || 'qa-regression-management');
}
