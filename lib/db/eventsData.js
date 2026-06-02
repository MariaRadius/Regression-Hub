import { AUDIT_CATEGORY } from '@/lib/constants';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

/**
 * Inserts a single event into the events collection.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} event - Fields to record (category, action, tcId, …).
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
 * Fans out one assignment event per tcId via insertMany.
 * No-op when tcIds is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ action: string, tcIds: string[], releaseId: string, environment: string, assignmentId: string, assignedTo: string, by: string|null, at: Date }} opts
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendAssignmentEvents(
  db,
  teamId,
  { action, tcIds, releaseId, environment, assignmentId, assignedTo, by, at },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!tcIds.length) return;
  const docs = tcIds.map((tcId) => ({
    teamId,
    category: AUDIT_CATEGORY.ASSIGNMENT,
    action,
    tcId,
    releaseId: releaseId ?? null,
    environment: environment ?? null,
    assignmentId,
    assignedTo,
    by,
    at,
  }));
  await db.collection('events').insertMany(docs);
}

/**
 * Returns all events for a team, optionally scoped to one tcId or releaseId,
 * sorted newest-first.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ tcId?: string, releaseId?: string }} opts
 * @returns {Promise<object[]>}
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function listEvents(db, teamId, { tcId, releaseId } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const query = { teamId };
  if (tcId) query.tcId = tcId;
  if (releaseId) query.releaseId = releaseId;
  const docs = await db
    .collection('events')
    .find(query)
    .sort({ at: -1 })
    .toArray();
  return docs.map(toClientDoc);
}
