import { ObjectId } from 'mongodb';
import {
  AUDIT_CATEGORY,
  COMPLETED_STATUSES,
  STATUS,
  statusToAction,
  UNASSIGNED_SENTINEL,
} from '@/lib/constants';
import { appendEvents } from '@/lib/db/eventsData';
import { ApiError } from '@/lib/errors';

const ALLOWED_FIELDS = [
  'status',
  'testedBy',
  'testedOn',
  'softwareVersionTested',
  'priority',
  'jiraStory',
  'applicationId',
  'moduleId',
  'notes',
  'type',
];

const EXECUTION_OUTPUT_FIELDS = ['testedBy', 'testedOn', 'notes'];

function buildBulkMatchQuery(teamId, { ids, filter, pendingOnly }) {
  if (ids?.length) {
    const matchQuery = {
      _id: { $in: ids.map((id) => new ObjectId(id)) },
      teamId,
    };
    if (pendingOnly) matchQuery.status = { $nin: COMPLETED_STATUSES };
    return matchQuery;
  }

  const matchQuery = { teamId };
  if (filter?.applicationId) matchQuery.applicationId = filter.applicationId;
  if (filter?.moduleId) matchQuery.moduleId = filter.moduleId;
  if (filter?.version) {
    matchQuery.softwareVersionTested = {
      $regex: filter.version,
      $options: 'i',
    };
  }
  if (filter?.testedBy === UNASSIGNED_SENTINEL) {
    matchQuery.$or = [
      { testedBy: '' },
      { testedBy: null },
      { testedBy: { $exists: false } },
    ];
  } else if (filter?.testedBy) {
    matchQuery.testedBy = filter.testedBy;
  }
  if (pendingOnly) matchQuery.status = { $nin: COMPLETED_STATUSES };
  return matchQuery;
}

/**
 * @see {@link ../../lib/__tests__/db/testCasesBulkData.test.js}
 */
export async function bulkUpdateTestCases(
  db,
  teamId,
  { ids, filter, fields, pendingOnly, actor },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if ((!ids?.length && !filter) || !fields) {
    throw new ApiError(400, 'ids or filter, and fields are required');
  }

  const update = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in fields) update[field] = fields[field];
  }
  update.updatedAt = new Date();

  // BR-18 — execution-output fields are only allowed when a status transition is also present
  if (!fields.status && EXECUTION_OUTPUT_FIELDS.some((f) => f in fields))
    throw new ApiError(
      400,
      'Tested by, tested on, and notes can only be set via a Pass, Fail, or Pending action',
    );

  // R11 — Fail requires notes
  if (fields.status === STATUS.FAIL && !fields.notes?.trim())
    throw new ApiError(400, 'Notes are required when status is Fail');

  // R12 — Pass/Fail: if softwareVersionTested is explicitly provided it must be non-empty;
  // if omitted entirely the existing value on each document is preserved.
  if (
    fields.status &&
    COMPLETED_STATUSES.includes(fields.status) &&
    'softwareVersionTested' in fields &&
    !fields.softwareVersionTested?.trim()
  )
    throw new ApiError(
      400,
      'softwareVersionTested is required when marking Pass or Fail',
    );

  // R14 — Pending reset requires notes
  if (fields.status === STATUS.PENDING && !fields.notes?.trim())
    throw new ApiError(400, 'A reason is required when resetting to Pending');

  const matchQuery = buildBulkMatchQuery(teamId, { ids, filter, pendingOnly });

  // BR-19 — count matched docs before narrowing, then exclude same-status cases
  let matchedBefore = 0;
  if (fields.status) {
    matchedBefore = await db.collection('testCases').countDocuments(matchQuery);
    matchQuery.status =
      matchQuery.status && typeof matchQuery.status === 'object'
        ? { ...matchQuery.status, $ne: fields.status }
        : { $ne: fields.status };
  }

  // R10 — Pass/Fail requires non-empty expectedResult on all target docs
  if (fields.status && COMPLETED_STATUSES.includes(fields.status)) {
    const missingCount = await db.collection('testCases').countDocuments({
      ...matchQuery,
      $or: [
        { expectedResult: '' },
        { expectedResult: null },
        { expectedResult: { $exists: false } },
      ],
    });
    if (missingCount > 0)
      throw new ApiError(
        400,
        `${missingCount} case(s) are missing an expected result — cannot mark Pass/Fail`,
      );
  }

  // Fetch affected docs before updateMany so we can build audit events.
  // Only needed when a status transition is being applied (BR-19 narrowing already
  // excludes docs already at the target status, so each fetched doc will change).
  let affectedDocs = [];
  if (fields.status) {
    affectedDocs = await db
      .collection('testCases')
      .find(matchQuery, {
        projection: { testCaseId: 1, softwareVersionTested: 1 },
      })
      .toArray();
  }

  const result = await db
    .collection('testCases')
    .updateMany(matchQuery, { $set: update });
  const skipped = fields.status ? matchedBefore - result.matchedCount : 0;

  // Emit one audit event per actually-changed doc.
  if (fields.status && affectedDocs.length) {
    const events = affectedDocs.map((doc) => ({
      category: AUDIT_CATEGORY.RESULT,
      action: statusToAction(fields.status),
      testCaseId: String(doc._id),
      externalId: doc.testCaseId ?? null,
      status: fields.status,
      softwareVersionTested: doc.softwareVersionTested ?? null,
      notes: fields.notes ?? null,
      by: actor ?? null,
      at: update.updatedAt,
    }));
    await appendEvents(db, teamId, events);
  }

  return { ok: true, updated: result.modifiedCount, skipped };
}
