import { ObjectId } from 'mongodb';
import {
  AUDIT_CATEGORY,
  COMPLETED_STATUSES,
  STATUS,
  statusToAction,
  UNASSIGNED_SENTINEL,
} from '@/lib/constants';
import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { appendEvent } from '@/lib/db/eventsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

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
  if (filters.assignedTo === UNASSIGNED_SENTINEL) {
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { assignedTo: '' },
          { assignedTo: null },
          { assignedTo: { $exists: false } },
        ],
      },
    ];
  } else if (filters.assignedTo) {
    query.assignedTo = filters.assignedTo;
  }
  if (filters.version)
    query.softwareVersionTested = { $regex: filters.version, $options: 'i' };
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
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError(400, 'Invalid id');
  }

  const [tc, { appMap, modMap }] = await Promise.all([
    db.collection('testCases').findOne({ _id: oid, teamId }),
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
    testRunId: 'manual',
    sourceFileName: 'manual',
    sourceSheetName: '',
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
    softwareVersionTested: '',
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
      { _id: new ObjectId(id), teamId },
      {
        projection: {
          status: 1,
          testCaseId: 1,
          expectedResult: 1,
          softwareVersionTested: 1,
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

      // R12 — validate against stored value; softwareVersionTested is not settable via single PATCH
      const effectiveVersion = existing?.softwareVersionTested?.trim();
      if (!effectiveVersion)
        throw new ApiError(
          400,
          'softwareVersionTested is required when marking Pass or Fail',
        );
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

  await db
    .collection('testCases')
    .updateOne({ _id: new ObjectId(id), teamId }, { $set: update });

  if (update.status) {
    const notes = body.notes ?? existing?.notes ?? null;
    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.RESULT,
      action: statusToAction(update.status),
      testCaseId: id,
      externalId: existing?.testCaseId ?? null,
      status: update.status,
      softwareVersionTested: existing?.softwareVersionTested ?? null,
      notes,
      assignmentId: null,
      assignedTo: null,
      by: actor ?? null,
      at: update.updatedAt,
    });
  }

  return { ok: true };
}

export async function resetTeamData(db, teamId) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const [testCases, testRuns, modules, applications, assignments, events] =
    await Promise.all([
      db.collection('testCases').deleteMany({ teamId }),
      db.collection('testRuns').deleteMany({ teamId }),
      db.collection('modules').deleteMany({ teamId }),
      db.collection('applications').deleteMany({ teamId }),
      db.collection('assignments').deleteMany({ teamId }),
      db.collection('events').deleteMany({ teamId }),
    ]);

  return {
    testCases: testCases.deletedCount,
    testRuns: testRuns.deletedCount,
    modules: modules.deletedCount,
    applications: applications.deletedCount,
    assignments: assignments.deletedCount,
    events: events.deletedCount,
  };
}
