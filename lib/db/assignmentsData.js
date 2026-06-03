import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvents } from '@/lib/db/eventsData';
import { ApiError } from '@/lib/errors';

/**
 * Assigns test cases to a user. Source of truth for the live assignee is
 * testResults.assignedTo; the events log is the sole assignment history.
 *
 * Scope = union of explicit `tcIds` plus every case in the given
 * `applicationIds` / `moduleIds` for the release (deduped). Each environment in
 * `environments` is updated; latest write wins.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, assignedTo: string, tcIds?: string[], applicationIds?: string[], moduleIds?: string[], environments: string[] }} body
 * @param {{ assignedBy?: string }} opts
 * @returns {Promise<{ ok: true, testCaseCount: number }>}
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function assignTestCases(db, teamId, body, { assignedBy } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const {
    releaseId,
    assignedTo,
    tcIds,
    applicationIds,
    moduleIds,
    environments,
  } = body ?? {};

  if (!releaseId) throw new ApiError(400, 'releaseId is required');
  if (!assignedTo) throw new ApiError(400, 'assignedTo is required');
  if (!Array.isArray(environments) || environments.length === 0)
    throw new ApiError(400, 'environments is required');

  const hasTc = Array.isArray(tcIds) && tcIds.length > 0;
  const hasApp = Array.isArray(applicationIds) && applicationIds.length > 0;
  const hasMod = Array.isArray(moduleIds) && moduleIds.length > 0;
  if (!hasTc && !hasApp && !hasMod)
    throw new ApiError(
      400,
      'at least one of tcIds, applicationIds, moduleIds is required',
    );

  // Resolve the scope to a deduped set of tcId strings.
  const tcIdSet = new Set(hasTc ? tcIds : []);
  if (hasApp || hasMod) {
    const or = [];
    if (hasApp) or.push({ applicationId: { $in: applicationIds } });
    if (hasMod) or.push({ moduleId: { $in: moduleIds } });
    const cases = await db
      .collection('testCases')
      .find({ teamId, releaseId, $or: or }, { projection: { _id: 1 } })
      .toArray();
    for (const c of cases) tcIdSet.add(c._id.toString());
  }
  const resolvedTcIds = [...tcIdSet];
  if (resolvedTcIds.length === 0)
    throw new ApiError(400, 'no test cases matched the given scope');

  // Mirror the assignee onto the live store for every target environment.
  await db.collection('testResults').updateMany(
    {
      teamId,
      releaseId,
      tcId: { $in: resolvedTcIds },
      environment: { $in: environments },
    },
    { $set: { assignedTo } },
  );

  // Append ASSIGN events — the sole assignment history.
  const at = new Date();
  const events = [];
  for (const tcId of resolvedTcIds) {
    for (const environment of environments) {
      events.push({
        category: AUDIT_CATEGORY.ASSIGNMENT,
        action: AUDIT_ACTION.ASSIGN,
        tcId,
        releaseId,
        environment,
        assignedTo,
        by: assignedBy ?? null,
        at,
      });
    }
  }
  await appendEvents(db, teamId, events);

  return { ok: true, testCaseCount: resolvedTcIds.length };
}
