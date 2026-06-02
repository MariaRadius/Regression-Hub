/**
 * One-time data migration for RXR-11849.
 *
 * Eliminates legacy release-wide assignments (environment === '__all__') by
 * expanding each one into N per-environment assignment documents — one per
 * concrete environment in the associated release's `environments` array.
 *
 * Background: the '__all__' sentinel was the previous way to assign a tester
 * to every environment in a release in a single document. The new model
 * requires one assignment per environment. This script performs the fan-out.
 *
 * testResults are NOT touched: release-wide assignments already mirrored
 * `assignedTo` onto all individual environment result rows at write time, so
 * no result documents need updating.
 *
 * Orphan handling: if the referenced release no longer exists, or if its
 * `environments` array is absent or empty, the '__all__' assignment is
 * deleted and logged as an orphan removal.
 *
 * Idempotent: only touches documents whose `environment === '__all__'`; a
 * second run finds nothing and is a no-op. Run with:
 *   node scripts/migrate-eliminate-release-wide-assignments.mjs
 *   node scripts/migrate-eliminate-release-wide-assignments.mjs --dry-run
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

// Hardcoded legacy sentinel — the ENVIRONMENT_SENTINEL constant is being
// removed from app code as part of RXR-11849; keep the literal here so this
// script stays self-contained and runnable after the constant is gone.
const RELEASE_WIDE_SENTINEL = '__all__';

const client = new MongoClient(loadUri());
await client.connect();
const db = client.db();

const assignmentsColl = db.collection('assignments');
const releasesColl = db.collection('releases');

// --- Load all release-wide assignment documents ---
const releaseWide = await assignmentsColl
  .find({ environment: RELEASE_WIDE_SENTINEL })
  .toArray();

console.warn(
  `Found ${releaseWide.length} release-wide ('__all__') assignment(s).`,
);

if (releaseWide.length === 0) {
  await client.close();
  console.warn(
    DRY_RUN
      ? 'Dry run complete — no writes.'
      : 'Migration complete. Nothing to do.',
  );
  process.exit(0);
}

// --- Resolve unique releaseIds to avoid redundant DB round-trips ---
const uniqueReleaseIds = [...new Set(releaseWide.map((a) => a.releaseId))];
const releaseMap = new Map();
for (const releaseId of uniqueReleaseIds) {
  // Releases store a STRING `_id` (see lib/db/releasesData.js), so query by the
  // raw string — wrapping in ObjectId would never match and would misclassify
  // every assignment as an orphan.
  const release = await releasesColl.findOne(
    { _id: releaseId },
    { projection: { _id: 1, environments: 1 } },
  );
  releaseMap.set(releaseId, release);
}

// --- Plan the work ---
let totalExpanded = 0;
let totalOrphans = 0;

const docsToInsert = []; // { assignmentId, docs[] }
const orphanIds = []; // _id values to delete without replacement

for (const assignment of releaseWide) {
  const { _id, environment: _env, ...rest } = assignment; // strip _id and environment
  const release = releaseMap.get(assignment.releaseId);

  const hasEnvironments =
    release != null &&
    Array.isArray(release.environments) &&
    release.environments.length > 0;

  if (!hasEnvironments) {
    orphanIds.push(_id);
    totalOrphans++;
    console.warn(
      `  Orphan (no valid release/environments): assignment _id=${_id}` +
        (release == null
          ? ` (release ${assignment.releaseId} not found)`
          : ` (release ${assignment.releaseId} has empty environments)`),
    );
    continue;
  }

  // Dedup defensively in case legacy data has duplicate environment entries.
  const uniqueEnvs = [...new Set(release.environments)];
  const expanded = uniqueEnvs.map((env) => ({
    ...rest,
    environment: env,
  }));

  docsToInsert.push({ assignmentId: _id, docs: expanded });
  totalExpanded += expanded.length;
}

console.warn(
  `Plan: expand ${docsToInsert.length} '__all__' doc(s) into ${totalExpanded} environment-scoped doc(s); remove ${totalOrphans} orphan(s).`,
);

if (DRY_RUN) {
  // Log per-assignment detail so the operator can inspect before committing.
  for (const { assignmentId, docs } of docsToInsert) {
    const envList = docs.map((d) => d.environment).join(', ');
    console.warn(`  Would expand _id=${assignmentId} -> [${envList}]`);
  }
  for (const id of orphanIds) {
    console.warn(`  Would delete orphan _id=${id}`);
  }
  await client.close();
  console.warn(
    `\nDry run complete — no writes.\n` +
      `Summary: would expand ${docsToInsert.length} release-wide assignment(s) into ` +
      `${totalExpanded} environment-scoped doc(s); would remove ${totalOrphans} orphan(s).`,
  );
  process.exit(0);
}

// --- Execute: insertMany new docs, then delete the original '__all__' doc ---
let insertedTotal = 0;
let deletedTotal = 0;

for (const { assignmentId, docs } of docsToInsert) {
  // Ordered insert fails fast; verify the full set landed BEFORE deleting the
  // source so a partial insert never destroys the original. Residual risk: a
  // crash between this insert and the delete leaves the '__all__' doc behind —
  // a re-run re-expands it (latest-wins ownership tolerates the extra history).
  const insertRes = await assignmentsColl.insertMany(docs);
  if (insertRes.insertedCount !== docs.length) {
    throw new Error(
      `Insert shortfall for _id=${assignmentId}: expected ${docs.length}, ` +
        `inserted ${insertRes.insertedCount}. Original NOT deleted — investigate and re-run.`,
    );
  }
  insertedTotal += insertRes.insertedCount;

  const deleteRes = await assignmentsColl.deleteOne({ _id: assignmentId });
  deletedTotal += deleteRes.deletedCount;

  console.warn(
    `  Expanded _id=${assignmentId}: inserted ${insertRes.insertedCount}, deleted original (${deleteRes.deletedCount}).`,
  );
}

// --- Execute: delete orphaned '__all__' assignments ---
if (orphanIds.length > 0) {
  const orphanRes = await assignmentsColl.deleteMany({
    _id: { $in: orphanIds },
  });
  deletedTotal += orphanRes.deletedCount;
  console.warn(`  Deleted ${orphanRes.deletedCount} orphan(s).`);
}

await client.close();
console.warn(
  `\nMigration complete.\n` +
    `Expanded ${docsToInsert.length} release-wide assignment(s) into ${insertedTotal} environment-scoped doc(s); ` +
    `deleted ${deletedTotal} legacy doc(s) (${totalOrphans} of them orphans).`,
);
