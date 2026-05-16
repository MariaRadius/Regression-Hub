import { getDb } from './mongodb';

let indexesEnsured = false;

export async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();

  await db.collection('applications').createIndex({ name: 1 }, { unique: true });
  await db.collection('modules').createIndex({ applicationId: 1, name: 1 }, { unique: true });
  await db.collection('testRuns').createIndex({ createdAt: -1 });
  await db.collection('testCases').createIndex({ testRunId: 1 });
  await db.collection('testCases').createIndex({ applicationId: 1 });
  await db.collection('testCases').createIndex({ moduleId: 1 });
  await db.collection('testCases').createIndex({ uniqueKey: 1 });

  indexesEnsured = true;
}
