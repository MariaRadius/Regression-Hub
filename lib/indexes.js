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
  // Execution state (status, tester) now lives on testResults, not testCases —
  // drop the definition-collection indexes that served those filters.
  await db
    .collection('testCases')
    .dropIndex('teamId_1_testedBy_1_createdAt_1')
    .catch(() => {});
  await db
    .collection('testCases')
    .dropIndex('teamId_1_status_1_createdAt_1')
    .catch(() => {});

  // Replace the non-unique testResults key with a unique one (one row per
  // (teamId, releaseId, tcId, environment)). The dense insert relies on
  // duplicate-key skipping, which only holds under a unique constraint.
  await db
    .collection('testResults')
    .dropIndex('teamId_1_releaseId_1_tcId_1_environment_1')
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

  // Drop old events index on testCaseId (replaced by tcId below)
  await db
    .collection('events')
    .dropIndex('teamId_1_testCaseId_1_at_-1')
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
  // testCases testKey lookup for import identity resolution
  await db.collection('testCases').createIndex({ teamId: 1, testKey: 1 });

  // testResults lookup by composite key (recordResult, listResultsForRelease,
  // getResultSummary, and the listing join). Unique: one row per
  // (teamId, releaseId, tcId, environment) — enforces the dense invariant and
  // lets the dense insert skip existing rows via duplicate-key errors.
  await db
    .collection('testResults')
    .createIndex(
      { teamId: 1, releaseId: 1, tcId: 1, environment: 1 },
      { unique: true },
    );
  // Backs the listTestCases scoped-listing driver $match
  // ({ teamId, releaseId, environment, status? }) — the unique index above has
  // tcId before environment, so it cannot serve a tcId-less (env, status) scan.
  await db
    .collection('testResults')
    .createIndex({ teamId: 1, releaseId: 1, environment: 1, status: 1 });

  // Assignee lookups within a release — backs the clone-carry read
  // ({ teamId, releaseId, assignedTo: { $ne: null } }) and assignee-filtered
  // listings. The unique index above leads with tcId, so it cannot serve an
  // assignedTo scan.
  await db
    .collection('testResults')
    .createIndex({ teamId: 1, releaseId: 1, assignedTo: 1 });

  // User lookup indexes
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  // partial index: active users ordered by name — eliminates in-memory sort for find({ teamId, active:{$ne:false} }).sort({name:1})
  // (settingsData.getTeamSettings)
  await db
    .collection('users')
    .createIndex(
      { teamId: 1, name: 1 },
      { partialFilterExpression: { active: { $ne: false } } },
    );
  // users/admin page sort: role first, then name (no active filter)
  await db.collection('users').createIndex({ teamId: 1, role: 1, name: 1 });

  await db.collection('events').createIndex({ teamId: 1, tcId: 1, at: -1 });
  await db.collection('events').createIndex({ teamId: 1, at: -1 });

  // Unique compound index for jiraStoryWatches: one doc per (teamId, storyKey)
  await db
    .collection('jiraStoryWatches')
    .createIndex({ teamId: 1, storyKey: 1 }, { unique: true });
  // Backs the "which keys need refresh" throttle query
  await db
    .collection('jiraStoryWatches')
    .createIndex({ teamId: 1, jiraCheckedAt: 1 });

  indexesEnsured = true;
}
