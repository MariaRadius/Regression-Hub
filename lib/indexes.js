import { getDb } from './mongodb';

let indexesEnsured = false;

export async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();

  // Drop any old unique indexes that may conflict
  await db.collection('applications').dropIndex('name_1').catch(() => {});
  await db.collection('modules').dropIndex('applicationId_1_name_1').catch(() => {});
  await db.collection('testCases').dropIndex('uniqueKey_1').catch(() => {});
  await db.collection('testCases').dropIndex('uniqueKey_1_teamId_1').catch(() => {});

  // Compound unique indexes scoped per team
  await db.collection('applications').createIndex({ name: 1, teamId: 1 }, { unique: true });
  await db.collection('modules').createIndex({ applicationId: 1, name: 1, teamId: 1 }, { unique: true });
  await db.collection('testRuns').createIndex({ teamId: 1, createdAt: -1 });

  // Compound indexes for common test-case query patterns (teamId first — always the primary filter)
  await db.collection('testCases').createIndex({ teamId: 1, createdAt: 1 });
  await db.collection('testCases').createIndex({ teamId: 1, applicationId: 1, createdAt: 1 });
  await db.collection('testCases').createIndex({ teamId: 1, moduleId: 1 });
  await db.collection('testCases').createIndex({ teamId: 1, testRunId: 1 });
  await db.collection('testCases').createIndex({ teamId: 1, testedBy: 1 });
  await db.collection('testCases').createIndex({ teamId: 1, softwareVersionTested: 1 });
  // Content fingerprint index for dedup across version/environment changes
  await db.collection('testCases').createIndex({ teamId: 1, contentKey: 1 });
  // History array index for fast version history aggregation
  await db.collection('testCases').createIndex({ teamId: 1, 'history.version': 1 });

  indexesEnsured = true;
}
