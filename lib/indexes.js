import { getDb } from './mongodb';

let indexesEnsured = false;

export async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();

  // Drop any old unique indexes that may conflict
  await db
    .collection('applications')
    .dropIndex('name_1')
    .catch(() => {});
  await db
    .collection('modules')
    .dropIndex('applicationId_1_name_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('uniqueKey_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('uniqueKey_1_teamId_1')
    .catch(() => {});

  // Drop old testCases indexes no longer relevant
  await db
    .collection('testCases')
    .dropIndex('teamId_1_moduleId_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_testedBy_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_assignedTo_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_softwareVersionTested_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_testRunId_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_history.version_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_applicationId_1_status_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_contentKey_1')
    .catch(() => {});

  // Drop old assignments indexes missing createdAt sort field (replaced below)
  await db
    .collection('assignments')
    .dropIndex('teamId_1_assignedTo_1')
    .catch(() => {});
  await db
    .collection('assignments')
    .dropIndex('teamId_1_assignedBy_1')
    .catch(() => {});

  // Drop old users index missing name sort field (replaced below)
  await db
    .collection('users')
    .dropIndex('teamId_1_active_1')
    .catch(() => {});
  // Drop bare active+name index superseded by partial index below
  await db
    .collection('users')
    .dropIndex('teamId_1_active_1_name_1')
    .catch(() => {});

  // Compound unique indexes scoped per team
  await db
    .collection('applications')
    .createIndex({ name: 1, teamId: 1 }, { unique: true });
  await db
    .collection('modules')
    .createIndex({ applicationId: 1, name: 1, teamId: 1 }, { unique: true });

  // Non-unique teamId-first index for find({ teamId }) scans (unique index has name first — cannot serve teamId-only filters)
  await db.collection('applications').createIndex({ teamId: 1, name: 1 });
  // Non-unique teamId-first index for find({ teamId }) scans (unique index has applicationId first)
  await db.collection('modules').createIndex({ teamId: 1, name: 1 });

  // Compound indexes for common test-case query patterns (teamId first — always the primary filter)
  await db.collection('testCases').createIndex({ teamId: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, applicationId: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, moduleId: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, testedBy: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, status: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, priority: 1, createdAt: 1 });
  await db
    .collection('testCases')
    .createIndex({ teamId: 1, applicationId: 1, moduleId: 1, createdAt: 1 });
  // Fingerprint index for import deduplication
  await db.collection('testCases').createIndex({ teamId: 1, fingerprint: 1 });

  // User lookup indexes
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  // partial index: active users ordered by name — eliminates in-memory sort for find({ teamId, active:{$ne:false} }).sort({name:1})
  // (settingsData.getTeamSettings, assignmentsData.getAssignmentsPageData)
  await db
    .collection('users')
    .createIndex(
      { teamId: 1, name: 1 },
      { partialFilterExpression: { active: { $ne: false } } },
    );
  // users/admin page sort: role first, then name (no active filter)
  await db.collection('users').createIndex({ teamId: 1, role: 1, name: 1 });

  // Assignment lookup indexes (sort by createdAt:-1)
  await db
    .collection('assignments')
    .createIndex({ teamId: 1, assignedTo: 1, createdAt: -1 });
  await db
    .collection('assignments')
    .createIndex({ teamId: 1, assignedBy: 1, createdAt: -1 });
  // bare teamId scan for view=all (no assignedTo/assignedBy filter)
  await db.collection('assignments').createIndex({ teamId: 1, createdAt: -1 });

  await db
    .collection('events')
    .createIndex({ teamId: 1, testCaseId: 1, at: -1 });
  await db.collection('events').createIndex({ teamId: 1, at: -1 });

  indexesEnsured = true;
}
