/**
 * Drops the obsolete `assignments` collection. Assignment state now lives on
 * testResults.assignedTo (live) and the events log (history). Clean-slate: no
 * backfill.
 *
 * Usage:
 *   node scripts/migrate-drop-assignments-collection.mjs --dry-run
 *   node scripts/migrate-drop-assignments-collection.mjs
 */
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

function loadUri() {
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('MONGODB_URI='));
  if (!line) throw new Error('MONGODB_URI not found in .env.local');
  return line.slice('MONGODB_URI='.length).trim();
}

const DRY_RUN = process.argv.includes('--dry-run');

const client = new MongoClient(loadUri());
await client.connect();
const db = client.db();

const exists =
  (await db.listCollections({ name: 'assignments' }).toArray()).length > 0;
const count = exists
  ? await db.collection('assignments').countDocuments({})
  : 0;

if (!exists) {
  console.warn('No `assignments` collection — nothing to do.');
} else if (DRY_RUN) {
  console.warn(`Dry run: would drop \`assignments\` (${count} doc(s)).`);
} else {
  await db.collection('assignments').drop();
  console.warn(`Dropped \`assignments\` (${count} doc(s) removed).`);
}

await client.close();
console.warn(DRY_RUN ? 'Dry run complete — no writes.' : 'Migration complete.');
