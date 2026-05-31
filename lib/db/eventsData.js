import { AUDIT_CATEGORY } from '@/lib/constants';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

/**
 * Inserts a single event into the events collection.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} event - Fields to record (category, action, testCaseId, …).
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvent(db, teamId, event) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  await db.collection('events').insertOne({ teamId, ...event });
}

/**
 * Inserts multiple events via insertMany. No-op when events is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object[]} events
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvents(db, teamId, events) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!events.length) return;
  const docs = events.map((e) => ({ teamId, ...e }));
  await db.collection('events').insertMany(docs);
}

/**
 * Fans out one assignment event per testCaseId via insertMany.
 * No-op when testCaseIds is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ action: string, testCaseIds: string[], assignmentId: string, assignedTo: string, by: string, at: Date }} opts
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendAssignmentEvents(
  db,
  teamId,
  { action, testCaseIds, assignmentId, assignedTo, by, at },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!testCaseIds.length) return;
  const docs = testCaseIds.map((testCaseId) => ({
    teamId,
    category: AUDIT_CATEGORY.ASSIGNMENT,
    action,
    testCaseId,
    externalId: null,
    status: null,
    softwareVersionTested: null,
    notes: null,
    assignmentId,
    assignedTo,
    by,
    at,
  }));
  await db.collection('events').insertMany(docs);
}

/**
 * Returns all events for a team, optionally scoped to one testCaseId,
 * sorted newest-first.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ testCaseId?: string }} opts
 * @returns {Promise<object[]>}
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function listEvents(db, teamId, { testCaseId } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const query = { teamId };
  if (testCaseId) query.testCaseId = testCaseId;
  const docs = await db
    .collection('events')
    .find(query)
    .sort({ at: -1 })
    .toArray();
  return docs.map(toClientDoc);
}
