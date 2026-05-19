run /**
 * Run once to create the two team accounts in MongoDB.
 * Usage: node scripts/seed-users.mjs
 */
import { MongoClient } from 'mongodb';
import { hash } from 'bcryptjs';
import { readFileSync } from 'fs';

// Read env without dotenv dependency
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const uri = env.MONGODB_URI;
const dbName = env.MONGODB_DB || 'qa-regression-management';

const USERS = [
  {
    username: 'qa-radius',
    name: 'QA Radius',
    password: 'RadiusQA2024!',
    teamId: 'radius',
    teamName: 'QA Radius Team',
    role: 'editor',
  },
  {
    username: 'qa-cb',
    name: 'QA CB',
    password: 'CBQA2024!',
    teamId: 'cb',
    teamName: 'QA CB Team',
    role: 'editor',
  },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('users').createIndex({ username: 1 }, { unique: true });

for (const u of USERS) {
  const passwordHash = await hash(u.password, 12);
  await db.collection('users').updateOne(
    { username: u.username },
    {
      $set: {
        name: u.name,
        teamId: u.teamId,
        teamName: u.teamName,
        role: u.role,
        passwordHash,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  console.log(`✓ Upserted user: ${u.username} (team: ${u.teamId}) — password: ${u.password}`);
}

await client.close();
console.log('\nDone. Both team accounts are ready.');
