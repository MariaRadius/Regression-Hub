import { ObjectId } from 'mongodb';
import { AUDIT_ACTION, ENVIRONMENT_SENTINEL } from '@/lib/constants';
import { appendAssignmentEvents } from '@/lib/db/eventsData';
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
          let: { cid: '$caseId', rid: '$releaseId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$caseId', '$$cid'] },
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
 * Returns the effective owner for a given (caseId, environment) pair
 * within a release — the most recently created matching assignment.
 * Release-wide assignments (environment === ENVIRONMENT_SENTINEL) are included
 * unless a more-specific env-scoped assignment exists.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, caseId: string, environment: string }} opts
 * @returns {Promise<object|null>} Most-recent assignment doc, or null if none.
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function getEffectiveAssignment(
  db,
  teamId,
  { releaseId, caseId, environment },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!caseId) throw new ApiError(400, 'caseId required');

  // Latest-wins: first try an env-scoped assignment, then fall back to release-wide.
  const envScopedQuery = { teamId, releaseId, caseId, environment };
  const envScoped = await db
    .collection('assignments')
    .find(envScopedQuery)
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  if (envScoped.length) return toClientDoc(envScoped[0]);

  const releaseWideQuery = {
    teamId,
    releaseId,
    caseId,
    environment: ENVIRONMENT_SENTINEL,
  };
  const releaseWide = await db
    .collection('assignments')
    .find(releaseWideQuery)
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  if (releaseWide.length) return toClientDoc(releaseWide[0]);

  return null;
}

/**
 * Creates an assignment for one test case in a release.
 * Does NOT write assignedTo/assignmentId back onto testCases — latest-wins
 * effective ownership is resolved at read time via getEffectiveAssignment.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ caseId: string, releaseId: string, assignedTo: string, environment?: string }} body
 * @param {{ assignedBy: string }} opts
 * @returns {Promise<{ ok: true, id: string }>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function createAssignment(db, teamId, body, { assignedBy }) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const { caseId, releaseId, assignedTo, environment } = body;

  if (!caseId) throw new ApiError(400, 'caseId is required');
  if (!releaseId) throw new ApiError(400, 'releaseId is required');
  if (!assignedTo) throw new ApiError(400, 'assignedTo is required');

  const resolvedEnvironment = environment ?? ENVIRONMENT_SENTINEL;
  const now = new Date();

  const doc = {
    teamId,
    caseId,
    releaseId,
    environment: resolvedEnvironment,
    assignedTo,
    assignedBy: assignedBy ?? null,
    createdAt: now,
  };

  const result = await db.collection('assignments').insertOne(doc);
  const assignmentId = result.insertedId.toString();

  await appendAssignmentEvents(db, teamId, {
    action: AUDIT_ACTION.ASSIGN,
    caseIds: [caseId],
    releaseId,
    environment: resolvedEnvironment,
    assignmentId,
    assignedTo,
    by: assignedBy ?? null,
    at: now,
  });

  return { ok: true, id: assignmentId };
}

/**
 * Deletes an assignment by id. Emits an UNASSIGN event.
 * Does NOT touch testCases — no assignedTo/assignmentId fields exist there.
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
    caseIds: [assignment.caseId],
    releaseId: assignment.releaseId,
    environment: assignment.environment ?? null,
    assignmentId: id,
    assignedTo: assignment.assignedTo,
    by: actor ?? null,
    at: new Date(),
  });

  return { ok: true };
}
