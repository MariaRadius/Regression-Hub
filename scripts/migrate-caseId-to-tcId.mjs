/**
 * One-time data migration for RXR-11849.
 *
 * Backfills the new `tcId` foreign key (= the test case's MongoDB `_id` as a
 * string) onto pre-existing `testResults`, `assignments`, and `events`
 * documents that were written under the old opaque `caseId` lineage scheme,
 * then drops the legacy `caseId` field from those collections and from
 * `testCases`. Also renames the user-label field `testCaseId` -> `externalCaseId`
 * on any `testCases` doc that still carries it.
 *
 * The `testCaseId` field on `events` documents (which holds a MongoDB `_id`,
 * not a lineage id) is intentionally left untouched.
 *
 * Idempotent: only touches docs that still carry `caseId`; a second run is a
 * no-op. Run with:  node scripts/migrate-caseId-to-tcId.mjs
 */
import { readFileSync } from 'fs';
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

// --- Build lineage map: (teamId::releaseId::caseId) -> testCase _id string ---
const testCases = await db
  .collection('testCases')
  .find({}, { projection: { _id: 1, caseId: 1, releaseId: 1, teamId: 1 } })
  .toArray();

const lineageToId = new Map();
for (const tc of testCases) {
  if (tc.caseId == null) continue;
  lineageToId.set(
    `${tc.teamId}::${tc.releaseId}::${tc.caseId}`,
    tc._id.toString(),
  );
}
console.log(
  `Loaded ${lineageToId.size} (team::release::caseId) -> _id mappings`,
);

/**
 * Backfill `tcId` on a referencing collection keyed by lineage, then unset
 * `caseId`. Rows whose `caseId` is null get `tcId: null`. Rows whose lineage
 * cannot be resolved (deleted test case) carry the old value forward so audit
 * history is preserved.
 */
async function migrateReferencing(collName) {
  const coll = db.collection(collName);
  const docs = await coll
    .find(
      { caseId: { $exists: true } },
      { projection: { _id: 1, caseId: 1, releaseId: 1, teamId: 1 } },
    )
    .toArray();

  let mapped = 0;
  let nulled = 0;
  let carried = 0;
  const ops = [];
  for (const d of docs) {
    let tcId;
    if (d.caseId == null) {
      tcId = null;
      nulled++;
    } else {
      const resolved = lineageToId.get(
        `${d.teamId}::${d.releaseId}::${d.caseId}`,
      );
      if (resolved) {
        tcId = resolved;
        mapped++;
      } else {
        tcId = d.caseId; // deleted lineage — preserve historical id
        carried++;
      }
    }
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { tcId }, $unset: { caseId: '' } },
      },
    });
  }

  console.log(
    `${collName}: ${docs.length} docs (mapped=${mapped} null=${nulled} carried=${carried})`,
  );
  if (ops.length && !DRY_RUN) {
    const res = await coll.bulkWrite(ops, { ordered: false });
    console.log(`  ${collName}: modified ${res.modifiedCount}`);
  }
}

await migrateReferencing('testResults');
await migrateReferencing('assignments');
await migrateReferencing('events');

// --- Handle legacy events caseIds[] fan-out arrays, if any exist ---
const arrDocs = await db
  .collection('events')
  .find(
    { caseIds: { $exists: true } },
    { projection: { _id: 1, caseIds: 1, releaseId: 1, teamId: 1 } },
  )
  .toArray();
if (arrDocs.length) {
  const ops = arrDocs.map((d) => ({
    updateOne: {
      filter: { _id: d._id },
      update: {
        $set: {
          tcIds: (d.caseIds ?? []).map(
            (cid) =>
              lineageToId.get(`${d.teamId}::${d.releaseId}::${cid}`) ?? cid,
          ),
        },
        $unset: { caseIds: '' },
      },
    },
  }));
  console.log(`events caseIds[]: ${arrDocs.length} docs`);
  if (!DRY_RUN) {
    const res = await db
      .collection('events')
      .bulkWrite(ops, { ordered: false });
    console.log(`  events caseIds[]: modified ${res.modifiedCount}`);
  }
}

// --- testCases: rename testCaseId -> externalCaseId, drop legacy caseId ---
if (!DRY_RUN) {
  const renamed = await db
    .collection('testCases')
    .updateMany(
      { testCaseId: { $exists: true } },
      { $rename: { testCaseId: 'externalCaseId' } },
    );
  console.log(
    `testCases: renamed testCaseId->externalCaseId on ${renamed.modifiedCount}`,
  );

  const dropped = await db
    .collection('testCases')
    .updateMany({ caseId: { $exists: true } }, { $unset: { caseId: '' } });
  console.log(`testCases: dropped legacy caseId on ${dropped.modifiedCount}`);
} else {
  const toRename = await db
    .collection('testCases')
    .countDocuments({ testCaseId: { $exists: true } });
  const toDrop = await db
    .collection('testCases')
    .countDocuments({ caseId: { $exists: true } });
  console.log(
    `testCases (dry-run): wouldRename=${toRename} wouldDropCaseId=${toDrop}`,
  );
}

await client.close();
console.log(DRY_RUN ? 'Dry run complete — no writes.' : 'Migration complete.');
