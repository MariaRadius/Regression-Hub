import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable in .env.local');
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'qa-regression-management';

const clientOptions = {
  maxPoolSize: 10,          // reuse up to 10 connections per process
  minPoolSize: 2,           // keep 2 warm connections ready
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 30_000,
  connectTimeoutMS: 10_000,
};

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
  // In dev, reuse across HMR reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, clientOptions);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, clientOptions);
  clientPromise = client.connect();
}

export async function getDb() {
  const client = await clientPromise;
  return client.db(dbName);
}

export default clientPromise;
