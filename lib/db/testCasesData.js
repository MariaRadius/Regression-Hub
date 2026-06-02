import { ObjectId } from 'mongodb';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  COMPLETED_STATUSES,
  ENVIRONMENT_SENTINEL,
  STATUS,
  statusToAction,
  UNASSIGNED_SENTINEL,
} from '@/lib/constants';
import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { appendEvent } from '@/lib/db/eventsData';
import { idMatch } from '@/lib/db/idQuery';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';

/**
 * Bulk-resolves the effective assignee for a set of caseIds in one query.
 * Env-specific assignment beats release-wide (ENVIRONMENT_SENTINEL); latest
 * createdAt wins within each bucket.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} environment
 * @param {string[]} caseIds
 * @returns {Promise<Record<string, string|null>>} map of caseId → assignedTo
 */
async function _resolveAssignees(db, teamId, releaseId, environment, caseIds) {
  if (!caseIds.length) return {};
  const docs = await db
    .collection('assignments')
    .find({
      teamId,
      releaseId,
      caseId: { $in: caseIds },
      environment: { $in: [environment, ENVIRONMENT_SENTINEL] },
    })
    .sort({ createdAt: -1 })
    .toArray();

  const envMap = {};
  const sentinelMap = {};
  for (const doc of docs) {
    if (doc.environment !== ENVIRONMENT_SENTINEL) {
      if (!envMap[doc.caseId]) envMap[doc.caseId] = doc.assignedTo;
    } else {
      if (!sentinelMap[doc.caseId]) sentinelMap[doc.caseId] = doc.assignedTo;
    }
  }

  return Object.fromEntries(
    caseIds.map((id) => [id, envMap[id] ?? sentinelMap[id] ?? null]),
  );
}

const PATCH_ALLOWED_FIELDS = [
  'status',
  'testedBy',
  'testedOn',
  'priority',
  'jiraStory',
  'testCaseId',
  'type',
  'traceability',
  'testCase',
  'preconditions',
  'steps',
  'expectedResult',
  'applicationId',
  'moduleId',
  'notes',
];

/**
 * Builds the MongoDB `status` field constraint for a comma-OR filter value.
 *
 * Pending is stored as `'Pending'` in new docs but may be `''`/`null`/missing
 * in legacy data, so we express "includes Pending" as `$nin: COMPLETED_STATUSES`
 * rather than `{ status: 'Pending' }`.
 *
 * Returns `null` when no constraint is needed (empty input or all three selected).
 */
function statusClause(raw) {
  if (!raw) return null;
  const vals = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (vals.length === 0) return null;

  const hasPending = vals.includes(STATUS.PENDING);
  const completedIncluded = COMPLETED_STATUSES.filter((s) => vals.includes(s));
  const completedExcluded = COMPLETED_STATUSES.filter((s) => !vals.includes(s));

  if (!hasPending) {
    // Only completed statuses — exact match or $in
    return completedIncluded.length === 1
      ? { status: completedIncluded[0] }
      : { status: { $in: completedIncluded } };
  }

  // Pending is included — exclude the completed statuses not in the selection.
  // $nin also catches legacy empty/null/missing docs that normalise to Pending.
  if (completedExcluded.length === 0) return null; // all three selected → no constraint
  return { status: { $nin: completedExcluded } };
}

function buildListQuery(teamId, filters) {
  const query = { teamId };
  if (filters.releaseId) query.releaseId = filters.releaseId;
  if (filters.applicationId) query.applicationId = filters.applicationId;
  if (filters.moduleId) query.moduleId = filters.moduleId;
  if (filters.testedBy === UNASSIGNED_SENTINEL) {
    query.$or = [
      { testedBy: '' },
      { testedBy: null },
      { testedBy: { $exists: false } },
    ];
  } else if (filters.testedBy) {
    query.testedBy = filters.testedBy;
  }
  if (filters.priority) query.priority = filters.priority;
  if (filters.jiraStory)
    query.jiraStory = { $regex: filters.jiraStory, $options: 'i' };
  const sc = statusClause(filters.status);
  if (sc) Object.assign(query, sc);
  return query;
}

/**
 * List test cases for a team with optional filters.
 *
 * Always fetches the app/mod maps and enriches each row with
 * applicationName/moduleName/status. The `applications` and `modules` arrays
 * are included in the response only when `filters.includeMeta` is truthy —
 * omitting them reduces wire size on every page/filter change after the initial
 * load (the DB queries still run to power the per-row name enrichment).
 *
 * @see {@link ../__tests__/db/testCasesData.test.js}
 */
export async function listTestCases(db, teamId, filters = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const page = Math.max(1, parseInt(filters.page || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit || '50', 10)));
  const skip = (page - 1) * limit;
  const query = buildListQuery(teamId, filters);

  const [testCases, total, { appMap, modMap, applications, modules }] =
    await Promise.all([
      db
        .collection('testCases')
        .find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('testCases').countDocuments(query),
      fetchAppModMaps(db, teamId),
    ]);

  const data = testCases.map((tc) => ({
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
    // Normalize legacy empty-string status to the canonical PENDING constant
    status: tc.status || STATUS.PENDING,
  }));

  const result = {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };

  if (filters.includeMeta) {
    result.applications = applications.map((a) => ({
      _id: a._id.toString(),
      name: a.name,
    }));
    result.modules = modules.map((m) => ({
      _id: m._id.toString(),
      name: m.name,
      applicationId: m.applicationId?.toString() || '',
    }));
  }

  return result;
}

export async function getTestCase(db, teamId, id) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid id');
  }

  const [tc, { appMap, modMap }] = await Promise.all([
    db.collection('testCases').findOne({ _id: idMatch(id), teamId }),
    fetchAppModMaps(db, teamId),
  ]);

  if (!tc) throw new ApiError(404, 'Test case not found');

  return {
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
    status: tc.status || STATUS.PENDING,
  };
}

export async function createTestCase(db, teamId, body) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const { applicationId, moduleId, ...fields } = body;
  if (!applicationId || !moduleId) {
    throw new ApiError(400, 'applicationId and moduleId required');
  }

  const doc = {
    teamId,
    applicationId,
    moduleId,
    type: fields.type || '',
    traceability: fields.traceability || '',
    testCaseId: fields.testCaseId || '',
    testCase: fields.testCase || '',
    preconditions: fields.preconditions || '',
    steps: fields.steps || '',
    expectedResult: fields.expectedResult || '',
    status: fields.status || STATUS.PENDING,
    notes: fields.notes || '',
    testedBy: fields.testedBy || '',
    testedOn: fields.testedOn || '',
    priority: fields.priority || '',
    jiraStory: fields.jiraStory || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection('testCases').insertOne(doc);
  return { ok: true, id: result.insertedId.toString() };
}

/**
 * @see {@link ../../lib/__tests__/db/testCasesData.test.js}
 */
export async function updateTestCase(db, teamId, id, body, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const update = {};
  for (const field of PATCH_ALLOWED_FIELDS) {
    if (field in body)
      update[field] =
        field === 'status' ? body[field] || STATUS.PENDING : body[field];
  }
  update.updatedAt = new Date();

  // R9 — cannot blank core content fields
  if ('testCase' in body && !body.testCase?.trim())
    throw new ApiError(400, 'testCase cannot be blank');
  if ('expectedResult' in body && !body.expectedResult?.trim())
    throw new ApiError(400, 'expectedResult cannot be blank');

  let existing = null;
  if (update.status) {
    // Fetch existing doc once — covers same-status guard AND R10/R11/R12 fallback
    existing = await db.collection('testCases').findOne(
      { _id: idMatch(id), teamId },
      {
        projection: {
          status: 1,
          testCaseId: 1,
          expectedResult: 1,
          notes: 1,
        },
      },
    );

    // R10/R11/R12 — Pass/Fail cross-field checks; merge incoming with DB values
    if (COMPLETED_STATUSES.includes(update.status)) {
      // R10 — effective expected result: incoming wins, else fall back to DB
      const effectiveExpectedResult =
        update.expectedResult?.trim() || existing?.expectedResult?.trim();
      if (!effectiveExpectedResult)
        throw new ApiError(
          400,
          'Cannot mark Pass/Fail — expectedResult is required on this case',
        );

      // R11 — notes required on Fail; incoming wins, else fall back to DB
      if (update.status === STATUS.FAIL) {
        const effectiveNotes = update.notes?.trim() || existing?.notes?.trim();
        if (!effectiveNotes)
          throw new ApiError(400, 'Notes are required when status is Fail');
      }
    }

    // R14 — reset to Pending requires an incoming reason; no fallback to existing
    if (update.status === STATUS.PENDING) {
      if (!update.notes?.trim())
        throw new ApiError(
          400,
          'A reason is required when resetting to Pending',
        );
    }
  }

  const { matchedCount } = await db
    .collection('testCases')
    .updateOne({ _id: idMatch(id), teamId }, { $set: update });

  if (matchedCount === 0) throw new ApiError(404, 'Test case not found');

  if (update.status) {
    const notes = body.notes ?? existing?.notes ?? null;
    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.RESULT,
      action: statusToAction(update.status),
      testCaseId: id,
      externalId: existing?.testCaseId ?? null,
      status: update.status,
      notes,
      assignmentId: null,
      assignedTo: null,
      by: actor ?? null,
      at: update.updatedAt,
    });
  }

  return { ok: true };
}

/**
 * Deletes a single test case and cascades to its results and assignments.
 * The entire operation runs in a transaction.
 *
 * Throws 400 when `teamId` is falsy or `id` is not a valid ObjectId.
 * Throws 404 when the test case does not exist or belongs to a different team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} id - ObjectId string of the test case
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteTestCase(db, teamId, id, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError(400, 'Invalid id');
  }

  const client = await getClient();
  const session = client.startSession();

  let caseId;
  try {
    await session.withTransaction(
      async () => {
        const tc = await db
          .collection('testCases')
          .findOne({ _id: oid, teamId }, { session });
        if (!tc) throw new ApiError(404, 'Test case not found');

        caseId = tc.caseId;

        await Promise.all([
          db
            .collection('testResults')
            .deleteMany({ teamId, caseId }, { session }),
          db
            .collection('assignments')
            .deleteMany({ teamId, caseId }, { session }),
        ]);

        await db
          .collection('testCases')
          .deleteOne({ _id: oid, teamId }, { session });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  if (caseId) {
    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.TEST_CASE,
      action: AUDIT_ACTION.DELETE,
      caseId,
      releaseId: null,
      environment: null,
      by: actor ?? null,
      at: new Date(),
    });
  }

  return { ok: true };
}

export async function resetTeamData(db, teamId) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const [testCases, modules, applications, assignments, events] =
    await Promise.all([
      db.collection('testCases').deleteMany({ teamId }),
      db.collection('modules').deleteMany({ teamId }),
      db.collection('applications').deleteMany({ teamId }),
      db.collection('assignments').deleteMany({ teamId }),
      db.collection('events').deleteMany({ teamId }),
    ]);

  return {
    testCases: testCases.deletedCount,
    modules: modules.deletedCount,
    applications: applications.deletedCount,
    assignments: assignments.deletedCount,
    events: events.deletedCount,
  };
}
