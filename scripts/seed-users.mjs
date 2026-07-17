/**
 * Seed individual user accounts for both locations.
 * Usage: node scripts/seed-users.mjs
 *
 * Each person gets their own login. Passwords are shown in the output.
 * Admin accounts can manage users; QA accounts can fill test results and assignments.
 */

import { readFileSync } from 'node:fs';
import { hash } from 'bcryptjs';
import { MongoClient } from 'mongodb';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const uri = env.MONGODB_URI;
const dbName = env.MONGODB_DB || 'qa-regression-management';

// ── Location: Radius ─────────────────────────────────────────────────────────
const RADIUS_USERS = [
  {
    username: 'maria',
    name: 'Maria',
    password: 'Maria@Radius1',
    role: 'admin',
  },
  { username: 'ammad', name: 'Ammad', password: 'Ammad@Radius1', role: 'qa' },
  {
    username: 'sohail',
    name: 'Sohail',
    password: 'Sohail@Radius1',
    role: 'qa',
  },
];

// ── Location: CB ─────────────────────────────────────────────────────────────
const CB_USERS = [
  { username: 'ali', name: 'Ali', password: 'Ali@CB1', role: 'admin' },
  { username: 'nimra', name: 'Nimra', password: 'Nimra@CB1', role: 'qa' },
  { username: 'aimen', name: 'Aimen', password: 'Aimen@CB1', role: 'qa' },
  { username: 'hamza', name: 'Hamza', password: 'Hamza@CB1', role: 'qa' },
];

const LOCATIONS = [
  { teamId: 'radius', teamName: 'Radius', users: RADIUS_USERS },
  { teamId: 'cb', teamName: 'CB', users: CB_USERS },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('users').createIndex({ username: 1 }, { unique: true });

console.warn('\n══════════════════════════════════════════════════════════');
console.warn('  QA Test Atlas — User Seed');
console.warn('══════════════════════════════════════════════════════════\n');

for (const { teamId, teamName, users } of LOCATIONS) {
  console.warn(`📍 Location: ${teamName}`);
  console.warn('─'.repeat(54));

  for (const u of users) {
    const passwordHash = await hash(u.password, 12);
    await db.collection('users').updateOne(
      { username: u.username },
      {
        $set: {
          name: u.name,
          teamId,
          teamName,
          role: u.role,
          passwordHash,
          active: true,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date(), createdBy: 'seed' },
      },
      { upsert: true },
    );

    const roleLabel = u.role === 'admin' ? ' [ADMIN]' : ' [QA]   ';
    console.warn(
      `  ✓${roleLabel}  ${u.username.padEnd(10)}  pw: ${u.password}`,
    );
  }

  console.warn();
}

// ── Clean up old shared team accounts (optional — comment out to keep them) ──
// await db.collection('users').deleteOne({ username: 'qa-radius' });
// await db.collection('users').deleteOne({ username: 'qa-cb' });

await client.close();

console.warn('══════════════════════════════════════════════════════════');
console.warn('  Done. Share credentials above with each team member.');
console.warn('  Admins can manage passwords via /users after first login.');
console.warn('══════════════════════════════════════════════════════════\n');
