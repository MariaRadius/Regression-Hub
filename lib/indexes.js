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
  await db.collection('testRuns').createIndex({ createdAt: -1 });
  await db.collection('testCases').createIndex({ testRunId: 1 });
  await db.collection('testCases').createIndex({ applicationId: 1 });
  await db.collection('testCases').createIndex({ moduleId: 1 });

  indexesEnsured = true;
}
