import { ObjectId } from 'mongodb';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  ENVIRONMENT_SENTINEL,
} from '@/lib/constants';
import { appendAssignmentEvents, appendEvents } from '@/lib/db/eventsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

/**
 * Lists all assignments for a release, newest-first.
 * Joins test case `testCase` (title) and `testKey` fields for display.
 * Optionally filters to a single assignee.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, assignedTo?: string }} opts
 * @returns {Promise<object[]>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function listAssignments(
  db,
  teamId,
  { releaseId, assignedTo } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const match = { teamId, releaseId };
  if (assignedTo) match.assignedTo = assignedTo;

  const docs = await db
    .collection('assignments')
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'testCases',
          let: { cid: '$tcId', rid: '$releaseId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    // assignment.tcId holds the test case _id as a string
                    { $eq: [{ $toString: '$_id' }, '$$cid'] },
                    { $eq: ['$releaseId', '$$rid'] },
                  ],
                },
              },
            },
            { $project: { testCase: 1, testKey: 1 } },
          ],
          as: '_tc',
        },
      },
      {
        $addFields: {
          caseName: { $ifNull: [{ $arrayElemAt: ['$_tc.testCase', 0] }, null] },
          testKey: { $ifNull: [{ $arrayElemAt: ['$_tc.testKey', 0] }, null] },
        },
      },
      { $project: { _tc: 0 } },
    ])
    .toArray();

  return docs.map(toClientDoc);
}

/**
 * Creates one assignment per test case in a release (latest-wins ownership).
 * After appending the audit events, mirrors the assignee onto the matching
 * `testResults` rows (live store). Scoping:
 *   - ENVIRONMENT_SENTINEL (release-wide) → updates ALL environment rows for
 *     those tcIds in that releaseId.
 *   - Specific environment string → updates only that environment's rows.
 *
 * A single-case create is just a one-element `tcIds`. Each inserted
 * assignment gets its own id; one ASSIGN event is emitted per case carrying
 * that case's assignmentId.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ tcIds: string[], releaseId: string, assignedTo: string, environment?: string }} body
 * @param {{ assignedBy: string }} opts
 * @returns {Promise<{ ok: true, id: string, testCaseCount: number }>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function createAssignment(db, teamId, body, { assignedBy }) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const { tcIds, releaseId, assignedTo, environment } = body;

  if (!Array.isArray(tcIds) || tcIds.length === 0)
    throw new ApiError(400, 'tcIds is required');
  if (!releaseId) throw new ApiError(400, 'releaseId is required');
  if (!assignedTo) throw new ApiError(400, 'assignedTo is required');

  const resolvedEnvironment = environment ?? ENVIRONMENT_SENTINEL;
  const now = new Date();

  const docs = tcIds.map((tcId) => ({
    teamId,
    tcId,
    releaseId,
    environment: resolvedEnvironment,
    assignedTo,
    assignedBy: assignedBy ?? null,
    createdAt: now,
  }));

  const { insertedIds } = await db.collection('assignments').insertMany(docs);
  const ids = docs.map((_, i) => insertedIds[i].toString());

  await appendEvents(
    db,
    teamId,
    tcIds.map((tcId, i) => ({
      category: AUDIT_CATEGORY.ASSIGNMENT,
      action: AUDIT_ACTION.ASSIGN,
      tcId,
      releaseId,
      environment: resolvedEnvironment,
      assignmentId: ids[i],
      assignedTo,
      by: assignedBy ?? null,
      at: now,
    })),
  );

  // Mirror assignee onto testResults (live store). Release-wide assignments
  // target all environment rows; environment-scoped assignments target only
  // the specific environment.
  const resultsFilter = {
    teamId,
    releaseId,
    tcId: { $in: tcIds },
  };
  if (resolvedEnvironment !== ENVIRONMENT_SENTINEL) {
    resultsFilter.environment = resolvedEnvironment;
  }
  await db
    .collection('testResults')
    .updateMany(resultsFilter, { $set: { assignedTo } });

  return { ok: true, id: ids[0], testCaseCount: ids.length };
}

/**
 * Deletes an assignment by id and clears `assignedTo` on the affected
 * `testResults` rows (live store). Emits an UNASSIGN audit event.
 *
 * Decision — keep the deleteOne on `assignments`: `listAssignments` and the
 * assignments page display live assignment docs (not events), so deleting the
 * doc is required for the current consumers to stop showing the assignment.
 * The UNASSIGN event in `events` remains the durable audit record. If the
 * product later adopts a fully append-only model, the deleteOne can be dropped
 * without any change to the event trail.
 *
 * Scoping matches the assignment being removed:
 *   - ENVIRONMENT_SENTINEL → clears ALL environment rows for that tcId.
 *   - Specific environment → clears only that environment's row.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} id - Assignment _id string
 * @param {{ actor?: string }} opts
 * @returns {Promise<{ ok: true }>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function deleteAssignment(db, teamId, id, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const assignment = await db.collection('assignments').findOne({
    _id: new ObjectId(id),
    teamId,
  });
  if (!assignment) throw new ApiError(404, 'Not found');

  await db.collection('assignments').deleteOne({ _id: new ObjectId(id) });

  await appendAssignmentEvents(db, teamId, {
    action: AUDIT_ACTION.UNASSIGN,
    tcIds: [assignment.tcId],
    releaseId: assignment.releaseId,
    environment: assignment.environment ?? null,
    assignmentId: id,
    assignedTo: assignment.assignedTo,
    by: actor ?? null,
    at: new Date(),
  });

  // Clear assignedTo on testResults (live store). Scoping mirrors the
  // assignment that was just removed.
  const { releaseId, tcId, environment } = assignment;
  const resultsFilter = { teamId, releaseId, tcId };
  if (environment && environment !== ENVIRONMENT_SENTINEL) {
    resultsFilter.environment = environment;
  }
  await db
    .collection('testResults')
    .updateMany(resultsFilter, { $set: { assignedTo: null } });

  return { ok: true };
}
